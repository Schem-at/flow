import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { executionGate } from '../src/services/executionGate';
import { containerArguments } from '../src/services/containerExecutor';
describe('private backend boundary',()=>{
 test('requires explicit enablement and a service token',async()=>{const old=process.env.TOOLS_BACKEND_ENABLED,token=process.env.TOOLS_SERVICE_TOKEN;try{const app=new Hono().use('*',executionGate).get('/',c=>c.json({ok:true}));delete process.env.TOOLS_BACKEND_ENABLED;expect((await app.request('/')).status).toBe(503);process.env.TOOLS_BACKEND_ENABLED='true';process.env.TOOLS_SERVICE_TOKEN='test-service-token';expect((await app.request('/')).status).toBe(401);expect((await app.request('/',{headers:{'X-Tools-Service-Token':'test-service-token'}})).status).toBe(200);}finally{if(old===undefined)delete process.env.TOOLS_BACKEND_ENABLED;else process.env.TOOLS_BACKEND_ENABLED=old;if(token===undefined)delete process.env.TOOLS_SERVICE_TOKEN;else process.env.TOOLS_SERVICE_TOKEN=token;}});
 test('contains OS isolation and a deadline even if the scheduler disappears',()=>{const args=containerArguments('job',9999999);expect(args).toContain('--network=none');expect(args).toContain('--read-only');expect(args).toContain('--memory=768m');expect(args).toContain('--cap-drop=ALL');expect(args).toContain('--user=1000:1000');expect(args).toContain('315');expect(args.some(a=>a==='-v'||a.startsWith('--mount'))).toBe(false);});
});
import { resolveDatabasePath } from '../src/db/path';
import { mkdtempSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
describe('database location on a read-only root',()=>{
 test('keeps a writable path and creates its directory',()=>{const dir=mkdtempSync(`${tmpdir()}/dbp-`);expect(resolveDatabasePath(`${dir}/nested/p.db`)).toBe(`${dir}/nested/p.db`);});
 test('falls back to the tmp dir when the directory cannot be written',()=>{const dir=mkdtempSync(`${tmpdir()}/dbp-`);chmodSync(dir,0o500);try{expect(resolveDatabasePath(`${dir}/data/p.db`,'/scratch')).toBe('/scratch/p.db');expect(resolveDatabasePath(`${dir}/p.db`,'/scratch')).toBe('/scratch/p.db');}finally{chmodSync(dir,0o700);}});
});
