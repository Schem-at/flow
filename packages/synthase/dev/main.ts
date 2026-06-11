import { execute } from "../src/index";

const script = `
export const io = {
  inputs: {
    name: { type: 'string', default: 'World' },
    count: { type: 'int', default: 3, min: 1, max: 10 }
  },
  outputs: {
    message: { type: 'string' }
  }
};

export default async function({ name, count }, { Logger }) {
  Logger.info(\`Greeting \${name} \${count} times\`);
  const message = Array(count).fill(\`Hello, \${name}!\`).join(' ');
  return { message };
}`;

let nameCLI = process.argv[2] || "World";
let countCLI = parseInt(process.argv[3]) || 3;
const result = await execute(script, { name: nameCLI, count: countCLI });
console.log(result.message); // "Hello, Synthase! Hello, Synthase!"
