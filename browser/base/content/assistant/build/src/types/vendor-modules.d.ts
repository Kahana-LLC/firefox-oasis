declare module "../../../../../../toolkit/content/vendor/marked/marked.mjs" {
  export const marked: {
    parse: (markdown: string) => string;
  };
}

declare module "*/toolkit/content/vendor/marked/marked.mjs" {
  export const marked: {
    parse: (markdown: string) => string;
  };
}

declare module "../../../../../../toolkit/content/vendor/dompurify/dompurify.mjs" {
  const DOMPurify: {
    sanitize: (value: string, options?: unknown) => string;
  };
  export default DOMPurify;
}

declare module "*/toolkit/content/vendor/dompurify/dompurify.mjs" {
  const DOMPurify: {
    sanitize: (value: string, options?: unknown) => string;
  };
  export default DOMPurify;
}
