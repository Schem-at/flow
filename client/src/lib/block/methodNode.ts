import { parseBlockSource } from "./parser";
import type { ApiGroup, ApiMember } from "./apiDocs";
/** Signatures come from the installed API declarations, including future methods. */
export async function methodNode(
    group: ApiGroup,
    member: ApiMember,
    groups: ApiGroup[],
) {
    const ts = await import("typescript");
    const file = ts.createSourceFile(
        "method.ts",
        `declare class Selected { ${member.signature}; }`,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );
    const declaration = file
        .statements[0] as import("typescript").ClassDeclaration;
    const method = declaration.members[0];
    if (!ts.isMethodDeclaration(method))
        throw new Error("Choose an API method.");
    const classNames = new Set(
        groups.filter((g) => g.source === "nucleation").map((g) => g.name),
    );
    const qualify = (text: string) =>
        text.replace(/\b[A-Za-z_$][\w$]*\b/g, (word) =>
            classNames.has(word) ? `Nucleation.${word}` : word,
        );
    const isStatic = method.modifiers?.some(
            (m) => m.kind === ts.SyntaxKind.StaticKeyword,
        ),
        fields: string[] = [],
        args: string[] = [];
    if (!isStatic) fields.push(`instance: Nucleation.${group.name}`);
    for (const param of method.parameters) {
        const name = param.name.getText(file);
        if (!/^[A-Za-z_$][\w$]*$/.test(name))
            throw new Error("Destructured API arguments require a code node.");
        fields.push(
            `${name}${param.questionToken ? "?" : ""}: ${qualify(param.type?.getText(file) ?? "unknown")}`,
        );
        args.push(`${param.dotDotDotToken ? "..." : ""}inputs.${name}`);
    }
    const result = qualify(method.type?.getText(file) ?? "unknown"),
        isVoid = result === "void";
    const code = `type Inputs = { ${fields.join("; ")} };\ntype Outputs = ${isVoid ? "{}" : `{ result: ${result} }`};\nfunction generate(inputs: Inputs): Outputs {\n  ${isVoid ? "" : "const result = "}${isStatic ? `Nucleation.${group.name}` : "inputs.instance"}.${member.name}(${args.join(", ")});\n  return ${isVoid ? "{}" : "{ result }"};\n}`;
    const parsed = await parseBlockSource(code);
    return {
        code,
        contract: parsed.contract,
        label: `${group.name}.${member.name}`,
    };
}
