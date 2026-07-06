// Reparación tolerante de JSON generado por LLM: fences de markdown, texto antes
// del objeto, comas colgantes, y truncamiento por límite de tokens (cierra strings,
// llaves y corchetes abiertos; poda claves colgantes sin valor).
export function repairLooseJson(content: string): string {
  let text = content
    .replace(/```(?:json)?/gi, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  const start = text.indexOf("{");
  if (start > 0) text = text.slice(start);
  if (!text.startsWith("{")) return text;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let completeEnd = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length === 0) { completeEnd = i + 1; break; }
    }
  }

  if (completeEnd > 0) {
    text = text.slice(0, completeEnd);
  } else {
    // Truncado: cerrar string abierto, podar restos colgantes y cerrar aperturas.
    if (inString) text += '"';
    text = text.replace(/[,:]\s*$/, "");
    text = text.replace(/([,{[])\s*"[^"]*"?\s*$/, (_match, opener: string) => (opener === "{" || opener === "[" ? opener : ""));
    text = text.replace(/[,:]\s*$/, "");
    while (stack.length) {
      const opener = stack.pop();
      text += opener === "{" ? "}" : "]";
    }
  }

  return text.replace(/,\s*([}\]])/g, "$1");
}
