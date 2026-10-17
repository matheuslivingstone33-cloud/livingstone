// Extração de texto de PDFs digitais, sem IA. PDFs escaneados (só imagem) não têm texto e exigem a IA/OCR.
import { extractText, getDocumentProxy } from "unpdf";

export async function pdfText(data: Buffer): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch {
    return "";
  }
}
