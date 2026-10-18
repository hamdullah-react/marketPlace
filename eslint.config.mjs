import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  /**
   * ── no-undef, ON for JavaScript ────────────────────────────────────────────
   *
   * eslint-config-next does not enable it, so a reference to a name that does
   * not exist was not an error here — it was nothing at all.
   *
   * That is not a style rule. It shipped a guaranteed crash through a green
   * typecheck, a green lint AND a green build: useLiveLeads.js registered
   * `unlockAudio` as an event listener after the import for it had been
   * removed, and the first `pointerdown` on any seller page threw
   * "unlockAudio is not defined". Nothing could have caught it — tsc does not
   * check .js, and `unlockAudio` is valid syntax that could legitimately have
   * been a browser global, so the bundler has no opinion either.
   *
   * ── Why JS only ───────────────────────────────────────────────────────────
   *
   * TypeScript already reports unknown identifiers in .ts/.tsx, and running
   * no-undef there is actively wrong: it does not understand type space, so
   * every interface and type alias used in an annotation reads as undefined.
   * typescript-eslint turns it off in TS for exactly this reason.
   *
   * ── Why both browser and node globals ─────────────────────────────────────
   *
   * App Router files are not one environment or the other. The same .js can
   * hold a server component reading process.env and a client component
   * touching window, and this config cannot tell them apart by path. Declaring
   * both is the honest description: it still catches a name that exists in
   * NEITHER, which is the whole class of bug this is here for.
   */
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
    },
    rules: {
      "no-undef": "error",
    },
  },

  /**
   * The .cjs maintenance scripts under src/marketplace/db — import/seed/repair
   * runners executed with `node`, never bundled. They are CommonJS, so they
   * need `require`, `module` and `__dirname` to be known names.
   */
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      "no-undef": "error",
    },
  },
]);

export default eslintConfig;
