// script-registry.ts
import { ScriptRegistry } from "./types.js";
export class InMemoryScriptRegistry implements ScriptRegistry {
	private scripts = new Map<string, string>();

	/**
	 * Register a script with content
	 */
	register(scriptId: string, content: string): void {
		this.scripts.set(scriptId, content);
	}

	/**
	 * Resolve script ID to content
	 */
	async resolve(scriptId: string): Promise<string> {
		const content = this.scripts.get(scriptId);
		if (!content) {
			throw new Error(`Script not found: ${scriptId}`);
		}
		return content;
	}

	/**
	 * List all registered scripts
	 */
	list(): string[] {
		return Array.from(this.scripts.keys());
	}

	/**
	 * Check if script exists
	 */
	has(scriptId: string): boolean {
		return this.scripts.has(scriptId);
	}

	/**
	 * Remove a script
	 */
	unregister(scriptId: string): boolean {
		const deleted = this.scripts.delete(scriptId);
		
		return deleted;
	}

	/**
	 * Clear all scripts
	 */
	clear(): void {
		this.scripts.clear();
	}
}

/**
 * HTTP-based script registry for loading from URLs
 */
export class HttpScriptRegistry implements ScriptRegistry {
	constructor(private baseUrl?: string) {}

	async resolve(scriptId: string): Promise<string> {
		// Handle absolute URLs
		if (scriptId.startsWith("http://") || scriptId.startsWith("https://")) {
			const response = await fetch(scriptId);
			if (!response.ok) {
				throw new Error(
					`Failed to fetch script: ${response.status} ${response.statusText}`
				);
			}
			return response.text();
		}

		// Handle relative URLs with base
		if (this.baseUrl) {
			const fullUrl = new URL(scriptId, this.baseUrl).toString();
			const response = await fetch(fullUrl);
			if (!response.ok) {
				throw new Error(
					`Failed to fetch script: ${response.status} ${response.statusText}`
				);
			}
			return response.text();
		}

		throw new Error(
			`Cannot resolve script: ${scriptId} (no base URL configured)`
		);
	}
}

/**
 * Composite registry that tries multiple sources in order
 */
export class CompositeScriptRegistry implements ScriptRegistry {
	constructor(private registries: ScriptRegistry[]) {}

	/**
	 * Add a registry to the end of the list
	 */
	addRegistry(registry: ScriptRegistry): void {
		this.registries.push(registry);
	}

	/**
	 * Add a registry to the beginning of the list (higher priority)
	 */
	prependRegistry(registry: ScriptRegistry): void {
		this.registries.unshift(registry);
	}

	async resolve(scriptId: string): Promise<string> {
		const errors: string[] = [];

		for (let i = 0; i < this.registries.length; i++) {
			const registry = this.registries[i];
			try {
				
				const result = await registry.resolve(scriptId);
				return result;
			} catch (error: any) {
				errors.push(`Registry ${i + 1}: ${error.message}`);
				
				continue;
			}
		}

		throw new Error(
			`Script not found in any registry: ${scriptId}. Errors: ${errors.join(
				"; "
			)}`
		);
	}
}

/**
 * File system registry (Node.js only)
 */
export class FileSystemScriptRegistry implements ScriptRegistry {
	constructor(private scriptsDirectory: string) {}

	async resolve(scriptId: string): Promise<string> {
		try {
			// Dynamic import for Node.js modules
			const fs = await import("fs/promises");
			const path = await import("path");

			// Security: prevent directory traversal
			const sanitizedId = scriptId.replace(/[^a-zA-Z0-9\-_.]/g, "");
			if (sanitizedId !== scriptId) {
				throw new Error(`Invalid script ID: contains unsafe characters`);
			}

			const scriptPath = path.join(this.scriptsDirectory, sanitizedId);

			// Ensure the resolved path is within the scripts directory
			const resolvedPath = path.resolve(scriptPath);
			const resolvedDir = path.resolve(this.scriptsDirectory);

			if (!resolvedPath.startsWith(resolvedDir)) {
				throw new Error(`Invalid script path: outside scripts directory`);
			}

			const content = await fs.readFile(scriptPath, "utf8");
			return content;
		} catch (error: any) {
			if (error.code === "ENOENT") {
				throw new Error(`Script file not found: ${scriptId}`);
			}
			throw new Error(
				`Failed to read script file ${scriptId}: ${error.message}`
			);
		}
	}
}

/**
 * Cached registry wrapper - adds caching to any registry
 */
export class CachedScriptRegistry implements ScriptRegistry {
	private cache = new Map<string, { content: string; timestamp: number }>();
	private ttl: number;

	constructor(private baseRegistry: ScriptRegistry, ttlMinutes: number = 5) {
		this.ttl = ttlMinutes * 60 * 1000;
	}

	async resolve(scriptId: string): Promise<string> {
		// Check cache first
		const cached = this.cache.get(scriptId);
		const now = Date.now();

		if (cached && now - cached.timestamp < this.ttl) {
			return cached.content;
		}

		// Not in cache or expired - fetch from base registry
		const content = await this.baseRegistry.resolve(scriptId);

		// Store in cache
		this.cache.set(scriptId, { content, timestamp: now });

		return content;
	}

	/**
	 * Clear cache
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats() {
		const entries = Array.from(this.cache.values());
		const now = Date.now();

		return {
			totalEntries: entries.length,
			avgAge:
				entries.length > 0
					? Math.round(
							entries.reduce((sum, e) => sum + (now - e.timestamp), 0) /
								entries.length /
								1000
					  )
					: 0,
			oldestEntry:
				entries.length > 0
					? Math.round(
							(now - Math.min(...entries.map((e) => e.timestamp))) / 1000
					  )
					: 0,
		};
	}

	/**
	 * Invalidate specific script
	 */
	invalidate(scriptId: string): boolean {
		const deleted = this.cache.delete(scriptId);
		
		return deleted;
	}
}

/**
 * GitHub script registry for loading from GitHub repositories
 */
export class GitHubScriptRegistry implements ScriptRegistry {
	constructor(
		private baseUrl: string = "https://raw.githubusercontent.com",
		private token?: string
	) {}

	async resolve(scriptId: string): Promise<string> {
		// Format: github:owner/repo/path/to/script.js[@branch]
		const githubMatch = scriptId.match(
			/^github:([^\/]+)\/([^\/]+)\/(.+?)(?:@(.+))?$/
		);

		if (!githubMatch) {
			throw new Error(
				`Invalid GitHub script format: ${scriptId}. Expected: github:owner/repo/path/to/script.js[@branch]`
			);
		}

		const [, owner, repo, path, branch = "main"] = githubMatch;
		const url = `${this.baseUrl}/${owner}/${repo}/${branch}/${path}`;

		const headers: Record<string, string> = {};
		if (this.token) {
			headers.Authorization = `token ${this.token}`;
		}


		const response = await fetch(url, { headers });
		if (!response.ok) {
			throw new Error(
				`GitHub fetch failed: ${response.status} ${response.statusText}`
			);
		}

		const content = await response.text();
		return content;
	}
}

/**
 * Environment-based registry - loads from different registries based on environment
 */
export class EnvironmentScriptRegistry implements ScriptRegistry {
	private registry: ScriptRegistry;

	constructor(
		private registries: {
			development?: ScriptRegistry;
			staging?: ScriptRegistry;
			production?: ScriptRegistry;
			default: ScriptRegistry;
		}
	) {
		const env = process.env.NODE_ENV || "development";
		this.registry =
			this.registries[env as keyof typeof this.registries] ||
			this.registries.default;

	}

	async resolve(scriptId: string): Promise<string> {
		return this.registry.resolve(scriptId);
	}

	/**
	 * Switch environment
	 */
	switchEnvironment(env: string): void {
		const newRegistry =
			this.registries[env as keyof typeof this.registries] ||
			this.registries.default;
		this.registry = newRegistry;
	}
}
