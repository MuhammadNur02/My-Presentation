/// <reference types="vite/client" />

declare module 'mammoth/mammoth.browser' {
  interface Result {
    value: string;
    messages: unknown[];
  }
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<Result>;
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<Result>;
  const mammoth: {
    convertToHtml: typeof convertToHtml;
    extractRawText: typeof extractRawText;
  };
  export default mammoth;
}
