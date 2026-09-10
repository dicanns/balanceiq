
export default [
  // App.jsx is included because it is where the damage is worst: a reference to
  // a state variable that was never declared (customRaisons, v1.48) builds
  // cleanly and throws the moment the screen opens.
  { files: ['src/components/**/*.jsx', 'src/App.jsx'],
    languageOptions: {
      ecmaVersion: 2022, sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { window:'readonly', document:'readonly', console:'readonly', alert:'readonly',
                 confirm:'readonly', setTimeout:'readonly', clearTimeout:'readonly',
                 Headers:'readonly', Response:'readonly', fetch:'readonly', Blob:'readonly',
                 URL:'readonly', localStorage:'readonly', React:'readonly', navigator:'readonly',
                 FileReader:'readonly', Intl:'readonly', requestAnimationFrame:'readonly', atob:'readonly', btoa:'readonly', Image:'readonly', crypto:'readonly', CustomEvent:'readonly', Event:'readonly', FormData:'readonly', AbortController:'readonly', TextDecoder:'readonly', TextEncoder:'readonly', structuredClone:'readonly', Notification:'readonly', setInterval:'readonly', clearInterval:'readonly' },
    },
    // This config exists only to catch undefined variables (a ReferenceError
    // shipped in v1.40.69 broke the whole Bank tab). Inline eslint-disable
    // comments target rules from the main config that aren't loaded here.
    linterOptions: { noInlineConfig: true },
    rules: { 'no-undef': 'error' },
  },
];
