// test/script-registry.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import {
	InMemoryScriptRegistry,
	HttpScriptRegistry,
	CompositeScriptRegistry,
	CachedScriptRegistry,
} from "../src/script-registry";

describe("Script Registries", () => {
	describe("InMemoryScriptRegistry", () => {
		let registry: InMemoryScriptRegistry;

		beforeEach(() => {
			registry = new InMemoryScriptRegistry();
		});

		it("should register and resolve scripts", async () => {
			const script = `
        export const io = { inputs: {}, outputs: {} };
        export default async function() { return {}; }
      `;

			registry.register("test-script", script);
			const resolved = await registry.resolve("test-script");

			expect(resolved).toBe(script);
		});

		it("should list registered scripts", () => {
			registry.register("script1", "content1");
			registry.register("script2", "content2");

			const scripts = registry.list();
			expect(scripts).toEqual(["script1", "script2"]);
		});

		it("should check if scripts exist", () => {
			registry.register("existing", "content");

			expect(registry.has("existing")).toBe(true);
			expect(registry.has("nonexistent")).toBe(false);
		});

		it("should unregister scripts", () => {
			registry.register("temp", "content");
			expect(registry.has("temp")).toBe(true);

			const deleted = registry.unregister("temp");
			expect(deleted).toBe(true);
			expect(registry.has("temp")).toBe(false);
		});

		it("should return false when unregistering nonexistent scripts", () => {
			const deleted = registry.unregister("nonexistent");
			expect(deleted).toBe(false);
		});

		it("should clear all scripts", () => {
			registry.register("script1", "content1");
			registry.register("script2", "content2");

			expect(registry.list()).toHaveLength(2);

			registry.clear();
			expect(registry.list()).toHaveLength(0);
		});

		it("should throw error for nonexistent scripts", async () => {
			await expect(registry.resolve("nonexistent")).rejects.toThrow(
				"Script not found: nonexistent"
			);
		});

		it("should handle empty script IDs", async () => {
			registry.register("", "empty id content");
			const resolved = await registry.resolve("");
			expect(resolved).toBe("empty id content");
		});

		it("should handle special characters in script IDs", async () => {
			const specialId = "script-with-special_chars.123";
			registry.register(specialId, "special content");
			const resolved = await registry.resolve(specialId);
			expect(resolved).toBe("special content");
		});
	});

	describe("HttpScriptRegistry", () => {
		describe("with base URL", () => {
			let registry: HttpScriptRegistry;

			beforeEach(() => {
				registry = new HttpScriptRegistry("https://example.com/scripts/");
			});

			it("should resolve relative URLs", async () => {
				// Mock fetch for testing
				global.fetch = async (url: string) => {
					if (url === "https://example.com/scripts/helper.js") {
						return {
							ok: true,
							text: async () => "script content",
						} as Response;
					}
					throw new Error(`Unexpected URL: ${url}`);
				};

				const content = await registry.resolve("helper.js");
				expect(content).toBe("script content");
			});

			it("should handle fetch errors", async () => {
				global.fetch = async () => {
					return {
						ok: false,
						status: 404,
						statusText: "Not Found",
					} as Response;
				};

				await expect(registry.resolve("missing.js")).rejects.toThrow(
					"Failed to fetch script: 404 Not Found"
				);
			});
		});

		describe("without base URL", () => {
			let registry: HttpScriptRegistry;

			beforeEach(() => {
				registry = new HttpScriptRegistry();
			});

			it("should resolve absolute URLs", async () => {
				global.fetch = async (url: string) => {
					if (url === "https://example.com/absolute-script.js") {
						return {
							ok: true,
							text: async () => "absolute script content",
						} as Response;
					}
					throw new Error(`Unexpected URL: ${url}`);
				};

				const content = await registry.resolve(
					"https://example.com/absolute-script.js"
				);
				expect(content).toBe("absolute script content");
			});

			it("should reject relative URLs without base", async () => {
				await expect(registry.resolve("relative-script.js")).rejects.toThrow(
					"Cannot resolve script: relative-script.js (no base URL configured)"
				);
			});
		});

		it("should handle network errors", async () => {
			const registry = new HttpScriptRegistry("https://unreachable.com/");

			global.fetch = async () => {
				throw new Error("Network error");
			};

			await expect(registry.resolve("script.js")).rejects.toThrow(
				"Network error"
			);
		});
	});

	describe("CompositeScriptRegistry", () => {
		let registry1: InMemoryScriptRegistry;
		let registry2: InMemoryScriptRegistry;
		let composite: CompositeScriptRegistry;

		beforeEach(() => {
			registry1 = new InMemoryScriptRegistry();
			registry2 = new InMemoryScriptRegistry();
			composite = new CompositeScriptRegistry([registry1, registry2]);
		});

		it("should resolve from first available registry", async () => {
			registry1.register("script1", "from registry1");
			registry2.register("script1", "from registry2");

			const content = await composite.resolve("script1");
			expect(content).toBe("from registry1");
		});

		it("should fallback to subsequent registries", async () => {
			registry2.register("script2", "from registry2");

			const content = await composite.resolve("script2");
			expect(content).toBe("from registry2");
		});

		it("should throw error if script not found in any registry", async () => {
			await expect(composite.resolve("nonexistent")).rejects.toThrow(
				"Script not found in any registry: nonexistent"
			);
		});

		it("should include all registry errors in failure message", async () => {
			// Make registry1 throw a specific error
			const failingRegistry = {
				resolve: async (id: string) => {
					throw new Error(`Custom error for ${id}`);
				},
			};

			const compositeWithError = new CompositeScriptRegistry([
				failingRegistry as any,
				registry2,
			]);

			try {
				await compositeWithError.resolve("missing");
			} catch (error: any) {
				expect(error.message).toContain("Registry 1: Custom error for missing");
				expect(error.message).toContain(
					"Registry 2: Script not found: missing"
				);
			}
		});

		it("should support adding registries", () => {
			const registry3 = new InMemoryScriptRegistry();
			registry3.register("script3", "from registry3");

			composite.addRegistry(registry3);

			// Should have 3 registries now
			expect(composite.resolve("script3")).resolves.toBe("from registry3");
		});

		it("should support prepending registries with higher priority", async () => {
			registry1.register("priority-test", "from registry1");
			registry2.register("priority-test", "from registry2");

			const registry3 = new InMemoryScriptRegistry();
			registry3.register("priority-test", "from registry3");

			composite.prependRegistry(registry3);

			const content = await composite.resolve("priority-test");
			expect(content).toBe("from registry3"); // Should come from prepended registry
		});

		it("should handle empty registry list", async () => {
			const emptyComposite = new CompositeScriptRegistry([]);

			await expect(emptyComposite.resolve("anything")).rejects.toThrow(
				"Script not found in any registry"
			);
		});
	});

	describe("CachedScriptRegistry", () => {
		let baseRegistry: InMemoryScriptRegistry;
		let cachedRegistry: CachedScriptRegistry;

		beforeEach(() => {
			baseRegistry = new InMemoryScriptRegistry();
			cachedRegistry = new CachedScriptRegistry(baseRegistry, 1); // 1 minute TTL
		});

		it("should cache resolved scripts", async () => {
			baseRegistry.register("cached-script", "original content");

			// First call should hit base registry
			const content1 = await cachedRegistry.resolve("cached-script");
			expect(content1).toBe("original content");

			// Modify base registry
			baseRegistry.register("cached-script", "modified content");

			// Second call should return cached version
			const content2 = await cachedRegistry.resolve("cached-script");
			expect(content2).toBe("original content"); // Still cached
		});

		it("should refresh expired cache entries", async () => {
			baseRegistry.register("expiring-script", "original content");

			// Create registry with very short TTL
			const shortCacheRegistry = new CachedScriptRegistry(baseRegistry, 0.001); // ~60ms

			const content1 = await shortCacheRegistry.resolve("expiring-script");
			expect(content1).toBe("original content");

			// Wait for cache to expire
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Modify base content
			baseRegistry.register("expiring-script", "updated content");

			// Should fetch fresh content
			const content2 = await shortCacheRegistry.resolve("expiring-script");
			expect(content2).toBe("updated content");
		});

		it("should provide cache statistics", async () => {
			baseRegistry.register("stats-test", "content");

			await cachedRegistry.resolve("stats-test");

			const stats = cachedRegistry.getCacheStats();
			expect(stats.totalEntries).toBe(1);
			expect(stats.avgAge).toBeGreaterThanOrEqual(0);
			expect(stats.oldestEntry).toBeGreaterThanOrEqual(0);
		});

		it("should support cache invalidation", async () => {
			baseRegistry.register("invalidate-test", "original");

			await cachedRegistry.resolve("invalidate-test");

			// Invalidate cache entry
			const invalidated = cachedRegistry.invalidate("invalidate-test");
			expect(invalidated).toBe(true);

			// Modify base content
			baseRegistry.register("invalidate-test", "updated");

			// Should fetch fresh content
			const content = await cachedRegistry.resolve("invalidate-test");
			expect(content).toBe("updated");
		});

		it("should support clearing entire cache", async () => {
			baseRegistry.register("clear-test1", "content1");
			baseRegistry.register("clear-test2", "content2");

			await cachedRegistry.resolve("clear-test1");
			await cachedRegistry.resolve("clear-test2");

			expect(cachedRegistry.getCacheStats().totalEntries).toBe(2);

			cachedRegistry.clearCache();
			expect(cachedRegistry.getCacheStats().totalEntries).toBe(0);
		});

		it("should handle base registry errors", async () => {
			await expect(cachedRegistry.resolve("nonexistent")).rejects.toThrow(
				"Script not found: nonexistent"
			);
		});

		it("should return false when invalidating nonexistent entries", () => {
			const invalidated = cachedRegistry.invalidate("nonexistent");
			expect(invalidated).toBe(false);
		});
	});

	describe("Integration Tests", () => {
		it("should work with complex registry hierarchies", async () => {
			// Create a complex setup: Cached -> Composite -> [Memory, HTTP]
			const memoryRegistry = new InMemoryScriptRegistry();
			const httpRegistry = new HttpScriptRegistry("https://example.com/");

			global.fetch = async (url: string) => {
				if (url === "https://example.com/remote-script.js") {
					return {
						ok: true,
						text: async () => "remote script content",
					} as Response;
				}
				return { ok: false, status: 404, statusText: "Not Found" } as Response;
			};

			const compositeRegistry = new CompositeScriptRegistry([
				memoryRegistry,
				httpRegistry,
			]);
			const cachedRegistry = new CachedScriptRegistry(compositeRegistry, 5);

			// Register local script
			memoryRegistry.register("local-script", "local content");

			// Test local resolution (should hit memory registry)
			const localContent = await cachedRegistry.resolve("local-script");
			expect(localContent).toBe("local content");

			// Test remote resolution (should hit HTTP registry and cache)
			const remoteContent = await cachedRegistry.resolve("remote-script.js");
			expect(remoteContent).toBe("remote script content");

			// Verify caching is working
			const stats = cachedRegistry.getCacheStats();
			expect(stats.totalEntries).toBe(2);
		});

		it("should handle registry priority correctly", async () => {
			const highPriorityRegistry = new InMemoryScriptRegistry();
			const lowPriorityRegistry = new InMemoryScriptRegistry();

			highPriorityRegistry.register("shared-script", "high priority content");
			lowPriorityRegistry.register("shared-script", "low priority content");

			const composite = new CompositeScriptRegistry([
				highPriorityRegistry,
				lowPriorityRegistry,
			]);

			const content = await composite.resolve("shared-script");
			expect(content).toBe("high priority content");
		});

		it("should handle mixed success and failure scenarios", async () => {
			const workingRegistry = new InMemoryScriptRegistry();
			const failingRegistry = {
				resolve: async () => {
					throw new Error("Always fails");
				},
			};

			workingRegistry.register("working-script", "success content");

			const composite = new CompositeScriptRegistry([
				failingRegistry as any,
				workingRegistry,
			]);

			// Should succeed despite first registry failing
			const content = await composite.resolve("working-script");
			expect(content).toBe("success content");

			// Should fail if no registry has the script
			await expect(composite.resolve("missing-script")).rejects.toThrow(
				"Script not found in any registry"
			);
		});
	});
});
