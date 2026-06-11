// dev-api/server.ts
import express from "express";
import cors from "cors";
import { execute, executeWithValidation, validate } from "../src/index";
import type { ContextProvider } from "../src/types";

// Import nucleation for Minecraft context
import initNucleationWasm, { SchematicWrapper } from "nucleation";

const app = express();
const PORT = 3001;

// Context providers
let minecraftContext: ContextProvider | null = null;

/**
 * Initialize Minecraft context provider with nucleation
 */
async function initializeMinecraftContext(): Promise<ContextProvider> {
	try {
		console.log("🔬 Initializing Nucleation WASM module...");
		await initNucleationWasm();
		console.log("✅ Nucleation WASM module initialized");

		return {
			Schematic: SchematicWrapper,
			Blocks: {
				get: (blockId: string) => {
					console.log(`🎯 Getting block: ${blockId}`);
					return { id: blockId, name: blockId };
				},
			},
		};
	} catch (error: any) {
		console.error("❌ Failed to initialize Nucleation WASM module:", error);
		throw error;
	}
}

/**
 * Create other context providers for different domains
 */
function createDataAnalysisContext(): ContextProvider {
	return {
		Statistics: {
			mean: (values: number[]) =>
				values.reduce((a, b) => a + b, 0) / values.length,
			median: (values: number[]) => {
				const sorted = [...values].sort((a, b) => a - b);
				const mid = Math.floor(sorted.length / 2);
				return sorted.length % 2
					? sorted[mid]
					: (sorted[mid - 1] + sorted[mid]) / 2;
			},
			standardDeviation: (values: number[]) => {
				const mean = values.reduce((a, b) => a + b, 0) / values.length;
				const variance =
					values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
					values.length;
				return Math.sqrt(variance);
			},
		},
		DataProcessing: {
			normalize: (values: number[]) => {
				const max = Math.max(...values);
				const min = Math.min(...values);
				return values.map((v) => (v - min) / (max - min));
			},
			group: (data: any[], key: string) => {
				return data.reduce((groups, item) => {
					const group = item[key];
					groups[group] = groups[group] || [];
					groups[group].push(item);
					return groups;
				}, {});
			},
		},
	};
}

// Initialize contexts on startup
async function initializeContexts() {
	try {
		console.log("🔧 Initializing context providers...");

		// Initialize Minecraft context (async because of WASM)
		minecraftContext = await initializeMinecraftContext();

		console.log("✅ All context providers initialized");
	} catch (error) {
		console.error("❌ Failed to initialize contexts:", error);
		// Continue without Minecraft context - scripts that don't need it will still work
	}
}

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
	console.log(`📡 ${req.method} ${req.path}`);
	next();
});

// ==================== ENHANCED TEST SCRIPTS ====================

const TEST_SCRIPTS = {
	simple: {
		script: `
export const io = {
  inputs: {
    message: { type: 'string', default: 'Hello World!' },
    count: { type: 'int', default: 1, min: 1, max: 10 }
  },
  outputs: {
    result: { type: 'string' },
    timestamp: { type: 'string' }
  }
};

export default async function({ message, count }, { Logger }) {
  Logger.info(\`Processing: \${message} x\${count}\`);
  
  const result = Array(count).fill(message).join(' ');
  const timestamp = new Date().toISOString();
  
  return { result, timestamp };
}`,
		context: "base", // Uses only base context
	},

	cuboid: {
		script: `
export const io = {
  inputs: {
    width: { type: 'int', default: 5, min: 1, max: 20 },
    height: { type: 'int', default: 5, min: 1, max: 20 },
    depth: { type: 'int', default: 5, min: 1, max: 20 },
    material: { type: 'string', default: 'minecraft:stone' }
  },
  outputs: {
    schematic: { type: 'object' },
    blocks: { type: 'int' }
  }
};

export default async function({ width, height, depth, material }, { Logger, Schematic }) {
  Logger.info(\`Creating \${width}x\${height}x\${depth} cuboid with \${material}\`);
  
  const schematic = new Schematic(width, height, depth);
  let blockCount = 0;
  
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      for (let z = 0; z < depth; z++) {
        schematic.set_block(x, y, z, material);
        blockCount++;
      }
    }
  }
  
  return { schematic, blocks: blockCount };
}`,
		context: "minecraft", // Needs Minecraft context
	},

	withImport: {
		script: `
export const io = {
  inputs: {
    number: { type: 'int', default: 21 }
  },
  outputs: {
    doubled: { type: 'int' },
    quadrupled: { type: 'int' }
  }
};

export default async function({ number }, { importScript, Logger }) {
  Logger.info(\`Processing number: \${number}\`);
  
  // Import a doubler script
  const doubler = await importScript(\`
    export const io = {
      inputs: { value: { type: 'int' } },
      outputs: { result: { type: 'int' } }
    };
    export default async function({ value }) {
      return { result: value * 2 };
    }
  \`);
  
  const doubled = await doubler({ value: number });
  const quadrupled = await doubler({ value: doubled.result });
  
  return { 
    doubled: doubled.result, 
    quadrupled: quadrupled.result 
  };
}`,
		context: "base",
	},

	dataAnalysis: {
		script: `
export const io = {
  inputs: {
    dataset: { 
      type: 'array', 
      default: [
        { name: 'Alice', score: 95 },
        { name: 'Bob', score: 87 },
        { name: 'Charlie', score: 92 },
        { name: 'Diana', score: 88 }
      ]
    }
  },
  outputs: {
    summary: { type: 'object' }
  }
};

export default async function({ dataset }, { Statistics, DataProcessing, Logger }) {
  Logger.info(\`Analyzing dataset with \${dataset.length} items\`);
  
  const scores = dataset.map(item => item.score);
  const normalized = DataProcessing.normalize(scores);
  
  return {
    summary: {
      mean: Statistics.mean(scores),
      median: Statistics.median(scores),
      stdDev: Statistics.standardDeviation(scores),
      normalizedScores: normalized,
      topPerformer: dataset[scores.indexOf(Math.max(...scores))]
    }
  };
}`,
		context: "data", // Needs data analysis context
	},
};

/**
 * Get context providers based on script requirements
 */
function getContextForScript(contextType: string): ContextProvider {
	const contexts: Record<string, ContextProvider> = {};

	// Add Minecraft context if available
	if (minecraftContext) {
		contexts.minecraft = minecraftContext;
	}

	// Add data analysis context
	contexts.data = createDataAnalysisContext();

	// Return the requested context, or empty object if not found
	return contexts[contextType] || {};
}

// ==================== ROUTES ====================

// Health check
app.get("/api/health", (req, res) => {
	res.json({
		success: true,
		status: "healthy",
		version: "2.0.0",
		contexts: {
			minecraft: minecraftContext ? "available" : "unavailable",
			data: "available",
			base: "available",
		},
		timestamp: new Date().toISOString(),
	});
});

// List test scripts
app.get("/api/test-scripts", (req, res) => {
	const scriptsWithInfo = Object.entries(TEST_SCRIPTS).map(([name, info]) => ({
		name,
		context: info.context,
		available:
			info.context === "base" ||
			(info.context === "minecraft" && minecraftContext) ||
			info.context === "data",
	}));

	res.json({
		success: true,
		scripts: scriptsWithInfo,
		timestamp: new Date().toISOString(),
	});
});

// Get test script content
app.get("/api/test-scripts/:name", (req, res) => {
	const scriptInfo = TEST_SCRIPTS[req.params.name as keyof typeof TEST_SCRIPTS];
	if (!scriptInfo) {
		return res.status(404).json({
			success: false,
			error: "Test script not found",
		});
	}

	const available =
		scriptInfo.context === "base" ||
		(scriptInfo.context === "minecraft" && minecraftContext) ||
		scriptInfo.context === "data";

	res.json({
		success: true,
		script: scriptInfo.script,
		context: scriptInfo.context,
		available,
		name: req.params.name,
	});
});

// Execute script (new v2 API with context injection)
app.post("/api/execute", async (req, res) => {
	try {
		const { script, inputs = {}, context: requestedContext } = req.body;

		if (!script) {
			return res.status(400).json({
				success: false,
				error: "Script content required",
			});
		}

		console.log(`🚀 Executing script (context: ${requestedContext || "auto"})`);
		const startTime = Date.now();

		// Determine context to use
		let contextProviders: ContextProvider = {};
		if (requestedContext) {
			contextProviders = getContextForScript(requestedContext);

			// Check if required context is available
			if (requestedContext === "minecraft" && !minecraftContext) {
				return res.status(400).json({
					success: false,
					error:
						"Minecraft context not available - nucleation failed to initialize",
				});
			}
		}

		const result = await execute(script, inputs, {
			contextProviders,
		});

		const duration = Date.now() - startTime;
		console.log(`✅ Execution completed in ${duration}ms`);

		res.json({
			success: true,
			result,
			context: requestedContext || "base",
			duration: `${duration}ms`,
			timestamp: new Date().toISOString(),
		});
	} catch (error: any) {
		console.error("❌ Execution failed:", error.message);
		res.status(400).json({
			success: false,
			error: error.message,
			timestamp: new Date().toISOString(),
		});
	}
});

// Execute with validation (new v2 API with context injection)
app.post("/api/execute-validated", async (req, res) => {
	try {
		const { script, inputs = {}, context: requestedContext } = req.body;

		if (!script) {
			return res.status(400).json({
				success: false,
				error: "Script content required",
			});
		}

		console.log(
			`🔍 Executing script with validation (context: ${
				requestedContext || "auto"
			})`
		);
		const startTime = Date.now();

		// Determine context to use
		let contextProviders: ContextProvider = {};
		if (requestedContext) {
			contextProviders = getContextForScript(requestedContext);

			// Check if required context is available
			if (requestedContext === "minecraft" && !minecraftContext) {
				return res.status(400).json({
					success: false,
					error:
						"Minecraft context not available - nucleation failed to initialize",
				});
			}
		}

		const result = await executeWithValidation(script, inputs, {
			contextProviders,
		});

		const duration = Date.now() - startTime;
		console.log(`✅ Validated execution completed in ${duration}ms`);

		res.json({
			success: true,
			result,
			context: requestedContext || "base",
			duration: `${duration}ms`,
			timestamp: new Date().toISOString(),
		});
	} catch (error: any) {
		console.error("❌ Validated execution failed:", error.message);
		res.status(400).json({
			success: false,
			error: error.message,
			timestamp: new Date().toISOString(),
		});
	}
});

// Execute test script by name (convenience endpoint)
app.post("/api/test/:name", async (req, res) => {
	try {
		const { inputs = {} } = req.body;
		const scriptName = req.params.name;

		const scriptInfo = TEST_SCRIPTS[scriptName as keyof typeof TEST_SCRIPTS];
		if (!scriptInfo) {
			return res.status(404).json({
				success: false,
				error: "Test script not found",
			});
		}

		// Check if required context is available
		if (scriptInfo.context === "minecraft" && !minecraftContext) {
			return res.status(400).json({
				success: false,
				error:
					"Minecraft context not available - nucleation failed to initialize",
			});
		}

		console.log(`🚀 Executing test script: ${scriptName}`);
		const startTime = Date.now();

		const contextProviders = getContextForScript(scriptInfo.context);
		const result = await execute(scriptInfo.script, inputs, {
			contextProviders,
		});

		const duration = Date.now() - startTime;
		console.log(`✅ Test execution completed in ${duration}ms`);

		res.json({
			success: true,
			result,
			script: scriptName,
			context: scriptInfo.context,
			duration: `${duration}ms`,
			timestamp: new Date().toISOString(),
		});
	} catch (error: any) {
		console.error("❌ Test execution failed:", error.message);
		res.status(400).json({
			success: false,
			error: error.message,
			timestamp: new Date().toISOString(),
		});
	}
});

// Validate script only
app.post("/api/validate", async (req, res) => {
	try {
		const { script, context: requestedContext } = req.body;

		if (!script) {
			return res.status(400).json({
				success: false,
				error: "Script content required",
			});
		}

		console.log(`🔍 Validating script`);

		// Determine context to use for validation
		let contextProviders: ContextProvider = {};
		if (requestedContext) {
			contextProviders = getContextForScript(requestedContext);
		}

		const validation = await validate(script, {
			contextProviders,
		});

		console.log(
			`✅ Validation completed: ${validation.valid ? "VALID" : "INVALID"}`
		);

		res.json({
			success: true,
			validation,
			context: requestedContext || "base",
			timestamp: new Date().toISOString(),
		});
	} catch (error: any) {
		console.error("❌ Validation failed:", error.message);
		res.status(500).json({
			success: false,
			error: error.message,
			timestamp: new Date().toISOString(),
		});
	}
});

// Simple HTML test interface
app.get("/", (req, res) => {
	res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Synthase v2.0 Test API</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .endpoint { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 4px; }
        .context { background: #e3f2fd; padding: 5px 10px; border-radius: 3px; display: inline-block; margin: 2px; font-size: 0.8em; }
        .available { background: #c8e6c9; }
        .unavailable { background: #ffcdd2; }
        pre { background: #2d3748; color: #e2e8f0; padding: 15px; border-radius: 4px; overflow-x: auto; }
        button { background: #3182ce; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin: 5px; }
        button:hover { background: #2c5aa0; }
        button:disabled { background: #ccc; cursor: not-allowed; }
      </style>
    </head>
    <body>
      <h1>🚀 Synthase v2.0 Test API</h1>
      <p>Server running on port ${PORT}</p>
      
      <h2>🧩 Context Providers</h2>
      <div class="context ${minecraftContext ? "available" : "unavailable"}">
        Minecraft (nucleation): ${
					minecraftContext ? "Available" : "Unavailable"
				}
      </div>
      <div class="context available">Data Analysis: Available</div>
      <div class="context available">Base: Available</div>
      
      <h2>📡 Endpoints</h2>
      <div class="endpoint">GET /api/health - Health check with context status</div>
      <div class="endpoint">GET /api/test-scripts - List test scripts with context info</div>
      <div class="endpoint">POST /api/execute - Execute script with context injection</div>
      <div class="endpoint">POST /api/execute-validated - Execute with validation and context</div>
      <div class="endpoint">POST /api/test/:name - Execute test script by name</div>
      <div class="endpoint">POST /api/validate - Validate script with context</div>
      
      <h2>🧪 Quick Tests</h2>
      <button onclick="testHealth()">Test Health</button>
      <button onclick="testSimple()">Test Simple Script</button>
      <button onclick="testCuboid()" ${
				!minecraftContext ? "disabled" : ""
			}>Test Cuboid ${!minecraftContext ? "(Unavailable)" : ""}</button>
      <button onclick="testImport()">Test Import Script</button>
      <button onclick="testDataAnalysis()">Test Data Analysis</button>
      <button onclick="testValidation()">Test Validation</button>
      
      <h3>Results:</h3>
      <pre id="results">Click a test button to see results...</pre>
      
      <h2>💡 Example cURL Commands</h2>
      <pre>
# Health check with context status
curl http://localhost:${PORT}/api/health

# Execute simple script (no context needed)
curl -X POST http://localhost:${PORT}/api/execute \\
  -H "Content-Type: application/json" \\
  -d '{
    "script": "export const io = { inputs: {}, outputs: { message: { type: \\"string\\" } } }; export default async function() { return { message: \\"Hello from Synthase v2!\\" }; }",
    "inputs": {}
  }'

# Execute with Minecraft context
curl -X POST http://localhost:${PORT}/api/execute \\
  -H "Content-Type: application/json" \\
  -d '{
    "script": "$(curl -s http://localhost:${PORT}/api/test-scripts/cuboid | jq -r .script)",
    "inputs": { "width": 3, "height": 3, "depth": 3, "material": "minecraft:gold_block" },
    "context": "minecraft"
  }'

# Execute test script by name
curl -X POST http://localhost:${PORT}/api/test/cuboid \\
  -H "Content-Type: application/json" \\
  -d '{ "inputs": { "width": 5, "height": 5, "depth": 5 } }'
      </pre>
      
      <script>
        async function makeRequest(method, url, data = null) {
          try {
            const options = {
              method,
              headers: { 'Content-Type': 'application/json' }
            };
            if (data) options.body = JSON.stringify(data);
            
            const response = await fetch(url, options);
            const result = await response.json();
            
            document.getElementById('results').textContent = JSON.stringify(result, null, 2);
            console.log(result);
          } catch (error) {
            document.getElementById('results').textContent = 'Error: ' + error.message;
          }
        }
        
        function testHealth() {
          makeRequest('GET', '/api/health');
        }
        
        function testSimple() {
          makeRequest('POST', '/api/test/simple', {
            inputs: { message: 'Hello from v2!', count: 3 }
          });
        }
        
        function testCuboid() {
          makeRequest('POST', '/api/test/cuboid', {
            inputs: { width: 3, height: 3, depth: 3, material: 'minecraft:diamond_block' }
          });
        }
        
        function testImport() {
          makeRequest('POST', '/api/test/withImport', {
            inputs: { number: 7 }
          });
        }
        
        function testDataAnalysis() {
          makeRequest('POST', '/api/test/dataAnalysis', {
            inputs: {}
          });
        }
        
        function testValidation() {
          makeRequest('POST', '/api/validate', {
            script: 'export const io = { inputs: {}, outputs: {} }; export default async function() { return {}; }'
          });
        }
      </script>
    </body>
    </html>
  `);
});

// Initialize contexts and start server
async function startServer() {
	await initializeContexts();

	app.listen(PORT, () => {
		console.log(
			`🎉 Synthase v2.0 Test API running on http://localhost:${PORT}`
		);
		console.log(
			`📚 Available test scripts: ${Object.keys(TEST_SCRIPTS).join(", ")}`
		);
		console.log(
			`🧩 Context providers: minecraft(${
				minecraftContext ? "available" : "unavailable"
			}), data(available), base(available)`
		);
		console.log("🔧 Ready to test the new injectable context API!");
	});
}

startServer().catch(console.error);
