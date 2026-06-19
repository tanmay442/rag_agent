// pdf-parse@1.1.1 ships a "lib/pdf-parse.js" entry that contains the
// actual implementation; the package's `index.js` wraps it with a
// debug branch that tries to read a bundled test PDF. We import the
// lib entry directly to avoid the debug branch, but the bundled
// @types/pdf-parse only declares the main module. This ambient
// declaration covers the lib path we actually use.
declare module 'pdf-parse/lib/pdf-parse.js' {
  import pdf from 'pdf-parse';
  export default pdf;
}
