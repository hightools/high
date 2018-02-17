/* eslint-disable no-template-curly-in-string */

export const globals = {
  DOCS_BASE_URL: '${DOCS_BASE_URL}',
  RESDIR_WEBSITE_URL: '${RESDIR_WEBSITE_URL}'
};

export function resolveGlobals(text) {
  for (const key of Object.keys(globals)) {
    const value = globals[key];
    text = text.replace(new RegExp('\\${' + key + '}', 'g'), value);
  }
  return text;
}

export default globals;