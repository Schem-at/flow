/**
 * WorkerDataStore - Manages persistent data objects in the worker
 * 
 * This allows SchematicWrapper and other heavy objects to stay in the worker
 * instead of being serialized/deserialized on every operation.
 * The main thread receives lightweight handles instead of full data.
 */

import {
  type DataHandle,
  type DataValue,
  type DataFormat,
  type DataMetadata,
  getDataCategory,
} from '../types/index.js';

/**
 * Internal storage entry for worker data
 */
interface StoredData {
  /** The actual data (SchematicWrapper, raw bytes, etc.) */
  value: unknown;
  /** Metadata about the data */
  handle: DataHandle;
  /** Last access time for LRU eviction */
  lastAccess: number;
  /** Whether this data should be kept even during eviction */
  pinned: boolean;
}

/**
 * Options for creating a data handle
 */
export interface StoreDataOptions {
  /** Human-readable name */
  name?: string;
  /** Keep this data even during memory pressure */
  pinned?: boolean;
  /** Additional metadata */
  metadata?: DataMetadata;
}

/**
 * Serialization options for getData
 */
export interface SerializeOptions {
  /** For images: max dimension to resize to */
  maxDimension?: number;
  /** Return full data or just a preview */
  fullData?: boolean;
}

/**
 * WorkerDataStore manages data lifecycle in the worker thread
 */
export class WorkerDataStore {
  private dataMap = new Map<string, StoredData>();
  private idCounter = 0;
  private maxSize: number;
  private currentSize = 0;

  constructor(maxSizeBytes = 500 * 1024 * 1024) { // 500MB default
    this.maxSize = maxSizeBytes;
  }

  /**
   * Generate a unique ID for data
   */
  private generateId(): string {
    return `data_${Date.now()}_${++this.idCounter}`;
  }

  /**
   * Estimate the size of a value in bytes
   */
  private estimateSize(value: unknown): number {
    if (value instanceof Uint8Array) {
      return value.byteLength;
    }
    if (value instanceof ArrayBuffer) {
      return value.byteLength;
    }
    if (typeof value === 'string') {
      return value.length * 2; // UTF-16
    }
    if (typeof value === 'object' && value !== null) {
      // For SchematicWrapper and other objects, try to estimate
      const obj = value as Record<string, unknown>;
      
      // Check for common data properties
      if ('data' in obj && obj.data instanceof Uint8Array) {
        return obj.data.byteLength;
      }
      if ('buffer' in obj && obj.buffer instanceof ArrayBuffer) {
        return obj.buffer.byteLength;
      }
      
      // Rough estimate for objects
      return JSON.stringify(value).length * 2;
    }
    return 64; // Minimum size for primitives
  }

  /**
   * Store data and return a handle
   */
  store(
    value: unknown,
    format: DataFormat,
    options: StoreDataOptions = {}
  ): DataHandle {
    const id = this.generateId();
    const byteSize = this.estimateSize(value);
    const category = getDataCategory(format);

    // Check if we need to evict
    while (this.currentSize + byteSize > this.maxSize && this.dataMap.size > 0) {
      this.evictLRU();
    }

    const handle: DataHandle = {
      id,
      category,
      format,
      byteSize,
      metadata: options.metadata,
      createdAt: Date.now(),
    };

    const stored: StoredData = {
      value,
      handle,
      lastAccess: Date.now(),
      pinned: options.pinned ?? false,
    };

    this.dataMap.set(id, stored);
    this.currentSize += byteSize;

    return handle;
  }

  /**
   * Get raw data by handle ID
   */
  get(handleId: string): unknown | null {
    const stored = this.dataMap.get(handleId);
    if (!stored) return null;

    stored.lastAccess = Date.now();
    return stored.value;
  }

  /**
   * Get handle info by ID
   */
  getHandle(handleId: string): DataHandle | null {
    const stored = this.dataMap.get(handleId);
    return stored?.handle ?? null;
  }

  /**
   * Serialize data for transfer to main thread
   * This is called when we need to send actual data (for preview/export)
   */
  serialize(handleId: string, _options: SerializeOptions = {}): DataValue | null {
    const stored = this.dataMap.get(handleId);
    if (!stored) {
      console.warn(`[WorkerDataStore] Handle not found: ${handleId}`);
      return null;
    }

    stored.lastAccess = Date.now();
    const { value, handle } = stored;

    // Handle different data types
    // For SchematicWrapper, call its to_schematic method
    if (this.isSchematicWrapper(value)) {
      const wrapper = value as SchematicWrapperLike;
      let data: Uint8Array | string;
      
      // Try different serialization methods
      if (typeof wrapper.to_schematic === 'function') {
        data = wrapper.to_schematic();
      } else if (typeof wrapper.serialize === 'function') {
        data = wrapper.serialize();
      } else {
        data = this.extractData(value);
      }
      
      console.log(`[WorkerDataStore] Serialized schematic, size: ${typeof data === 'string' ? data.length : data.byteLength} bytes`);
      return {
        format: handle.format,
        data,
        metadata: handle.metadata,
        handleId,
      };
    }

    // For raw data values, just return as-is
    if (this.isDataValue(value)) {
      return {
        ...value as DataValue,
        handleId,
      };
    }

    // For other objects, try to extract data
    return {
      format: handle.format,
      data: this.extractData(value),
      metadata: handle.metadata,
      handleId,
    };
  }

  /**
   * Release a handle and free memory
   */
  release(handleId: string): boolean {
    const stored = this.dataMap.get(handleId);
    if (!stored) return false;

    this.currentSize -= stored.handle.byteSize;
    this.dataMap.delete(handleId);
    return true;
  }

  /**
   * Pin data to prevent eviction
   */
  pin(handleId: string): boolean {
    const stored = this.dataMap.get(handleId);
    if (!stored) return false;
    stored.pinned = true;
    return true;
  }

  /**
   * Unpin data to allow eviction
   */
  unpin(handleId: string): boolean {
    const stored = this.dataMap.get(handleId);
    if (!stored) return false;
    stored.pinned = false;
    return true;
  }

  /**
   * List all handles
   */
  list(): DataHandle[] {
    return Array.from(this.dataMap.values()).map(s => s.handle);
  }

  /**
   * Get memory usage stats
   */
  stats(): { used: number; max: number; count: number } {
    return {
      used: this.currentSize,
      max: this.maxSize,
      count: this.dataMap.size,
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.dataMap.clear();
    this.currentSize = 0;
  }

  /**
   * Evict least recently used item
   */
  private evictLRU(): boolean {
    let oldest: StoredData | null = null;
    let oldestId: string | null = null;

    for (const [id, stored] of this.dataMap.entries()) {
      if (stored.pinned) continue;
      if (!oldest || stored.lastAccess < oldest.lastAccess) {
        oldest = stored;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.release(oldestId);
      return true;
    }
    return false;
  }

  /**
   * Check if value looks like a SchematicWrapper
   */
  private isSchematicWrapper(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const obj = value as Record<string, unknown>;
    return typeof obj.to_schematic === 'function' ||
      typeof obj.serialize === 'function' ||
      typeof obj.get_block === 'function' ||
      typeof obj.set_block === 'function';
  }

  /**
   * Check if value is a DataValue
   */
  private isDataValue(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const obj = value as Record<string, unknown>;
    return 'format' in obj && 'data' in obj;
  }

  /**
   * Extract raw data from various object types
   */
  private extractData(value: unknown): Uint8Array | string {
    if (value instanceof Uint8Array) return value;
    if (typeof value === 'string') return value;
    
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if ('data' in obj) {
        if (obj.data instanceof Uint8Array) return obj.data;
        if (typeof obj.data === 'string') return obj.data;
      }
      if ('buffer' in obj && obj.buffer instanceof ArrayBuffer) {
        return new Uint8Array(obj.buffer);
      }
    }
    
    // Fallback to JSON serialization
    return JSON.stringify(value);
  }
}

/**
 * Interface for SchematicWrapper-like objects
 */
interface SchematicWrapperLike {
  to_schematic?: () => Uint8Array;
  serialize?: () => Uint8Array;
  get_block?: (x: number, y: number, z: number) => string;
  set_block?: (x: number, y: number, z: number, block: string) => void;
  createDefinitionRegionFromPoint?: (name: string, x: number, y: number, z: number) => void;
  getDimensions?: () => { x: number; y: number; z: number };
  
}

// Export a singleton instance
export const workerDataStore = new WorkerDataStore();
