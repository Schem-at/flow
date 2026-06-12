/**
 * Module storage layer
 *
 * Defines a narrow ModuleStore interface used by the modules router, plus the
 * default Drizzle/SQLite implementation. Tests provide an in-memory
 * implementation of the same interface (bun:sqlite is unavailable under vitest).
 */

import { eq } from 'drizzle-orm';
import {
  db,
  modules,
  moduleVersions,
  type Module,
  type ModuleVersion,
  type NewModule,
  type NewModuleVersion,
} from '../db/index.js';

export interface ModuleStore {
  listModules(): Promise<Module[]>;
  getModule(id: string): Promise<Module | undefined>;
  getModuleBySlug(slug: string): Promise<Module | undefined>;
  createModule(module: NewModule): Promise<void>;
  updateModule(id: string, fields: Partial<Pick<Module, 'name' | 'description' | 'visibility' | 'updatedAt'>>): Promise<void>;
  deleteModule(id: string): Promise<void>;
  listVersions(moduleId: string): Promise<ModuleVersion[]>;
  createVersion(version: NewModuleVersion): Promise<void>;
  updateVersion(id: string, fields: Partial<Pick<ModuleVersion, 'code' | 'ioSchema' | 'changeNote' | 'isLatest'>>): Promise<void>;
  /** Mark the given version as latest and unmark all other versions of the module */
  setLatestVersion(moduleId: string, versionId: string): Promise<void>;
}

export const drizzleModuleStore: ModuleStore = {
  async listModules() {
    return db.select().from(modules).all();
  },

  async getModule(id) {
    return db.select().from(modules).where(eq(modules.id, id)).get();
  },

  async getModuleBySlug(slug) {
    return db.select().from(modules).where(eq(modules.slug, slug)).get();
  },

  async createModule(module) {
    await db.insert(modules).values(module);
  },

  async updateModule(id, fields) {
    await db.update(modules).set(fields).where(eq(modules.id, id));
  },

  async deleteModule(id) {
    await db.delete(moduleVersions).where(eq(moduleVersions.moduleId, id));
    await db.delete(modules).where(eq(modules.id, id));
  },

  async listVersions(moduleId) {
    return db.select().from(moduleVersions).where(eq(moduleVersions.moduleId, moduleId)).all();
  },

  async createVersion(version) {
    await db.insert(moduleVersions).values(version);
  },

  async updateVersion(id, fields) {
    await db.update(moduleVersions).set(fields).where(eq(moduleVersions.id, id));
  },

  async setLatestVersion(moduleId, versionId) {
    await db.update(moduleVersions)
      .set({ isLatest: false })
      .where(eq(moduleVersions.moduleId, moduleId));
    await db.update(moduleVersions)
      .set({ isLatest: true })
      .where(eq(moduleVersions.id, versionId));
  },
};
