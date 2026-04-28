declare global {
  interface Window {
    MathJax?: {
      tex?: {
        inlineMath?: string[][];
        displayMath?: string[][];
        processEscapes?: boolean;
      };
      svg?: {
        fontCache?: string;
      };
      startup?: {
        typeset?: boolean;
        promise?: Promise<void>;
      };
      typesetClear?: (elements?: HTMLElement[]) => void;
      typesetPromise?: (elements?: HTMLElement[]) => Promise<void>;
    };
    __mathJaxLoaderPromise__?: Promise<void>;
  }
}

const MATHJAX_SCRIPT_ID = "mathjax-script";
const MATHJAX_SRC =
  "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js";

const waitForMathJaxReady = () =>
  new Promise<void>((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      if (window.MathJax?.typesetPromise) {
        const startupPromise = window.MathJax.startup?.promise;
        if (startupPromise) {
          void startupPromise.then(() => resolve(), reject);
        } else {
          resolve();
        }
        return;
      }

      attempts += 1;
      if (attempts > 200) {
        reject(new Error("MathJax did not become ready."));
        return;
      }

      window.setTimeout(check, 25);
    };

    check();
  });

export const ensureMathJax = () => {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.MathJax?.typesetPromise) {
    return window.MathJax.startup?.promise ?? Promise.resolve();
  }

  if (window.__mathJaxLoaderPromise__) {
    return window.__mathJaxLoaderPromise__;
  }

  window.MathJax = {
    loader: { load: ["[tex]/mhchem"] },
    tex: {
      packages: { "[+]": ["mhchem"] },
      inlineMath: [
        ["$", "$"],
        ["$$", "$$"],
        ["\\(", "\\)"],
      ],
      displayMath: [["\\[", "\\]"]],
      processEscapes: true,
    },
    options: {
      processHtmlClass: "tex2jax_process",
    },
    chtml: {
      displayAlign: "left",
    },
    startup: {
      typeset: false,
    },
  } as any;

  window.__mathJaxLoaderPromise__ = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(
      MATHJAX_SCRIPT_ID,
    ) as HTMLScriptElement | null;

    if (existingScript) {
      void waitForMathJaxReady().then(resolve, reject);
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Failed to load MathJax.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = MATHJAX_SCRIPT_ID;
    script.async = true;
    script.src = MATHJAX_SRC;
    script.addEventListener(
      "load",
      () => {
        void waitForMathJaxReady().then(resolve, reject);
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => reject(new Error("Failed to load MathJax.")),
      { once: true },
    );
    document.head.appendChild(script);
  });

  return window.__mathJaxLoaderPromise__;
};

export const typesetMathInElement = async (container: HTMLElement) => {
  await ensureMathJax();
  if (!window.MathJax?.typesetPromise) {
    return;
  }
  window.MathJax.typesetClear?.([container]);
  await window.MathJax.typesetPromise([container]);
};
