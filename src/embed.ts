import * as monaco from 'monaco-editor';
// @ts-ignore
import { parseTmTheme } from "monaco-themes";

const params = new Proxy<any>(new URLSearchParams(window.location.search), {
    get: (searchParams, prop) => searchParams.get(String(prop)),
});

const send = (obj: any) => window.top?.postMessage({ ...obj, context: params.context }, '*');
const receive = (type: string, cb: (e: any) => void) =>
    window.addEventListener('message', (e) =>
        e.data.type === type && cb(e.data));

const options: monaco.editor.IStandaloneEditorConstructionOptions = {
    value: params.code ?? '',
    language: params.lang ?? 'javascript',
    theme: params.theme ?? 'vs',
    contextmenu: params.contextmenu !== 'false',
    folding: params.folding !== 'false',
    readOnly: params.readonly === 'true',
    lineNumbers: params.lineNumbers as any ?? 'on',
    automaticLayout: true,
    minimap: {
        enabled: params.minimap !== 'false',
    },
};

console.log("options are", options);
const builtinThemes = ['vs', 'vs-dark', 'hc-black', 'hc-light'];

const editor = monaco.editor.create(document.getElementById('root') ?? document.body, options);

const getCustomThemeName = (theme: string | undefined) => {
    return theme && !builtinThemes.includes(theme) ? theme : undefined
}
const getBuiltinTheme = (theme: string | undefined) => {
    return theme && builtinThemes.includes(theme) ? theme : undefined
}

const loadTheme = async (themeName: string | undefined): Promise<monaco.editor.IStandaloneThemeData | undefined> => {
    if (!themeName) return Promise.resolve(undefined);
    try {
        // Use relative path from the base URL to support non-root deployments
        const baseUrl = new URL('.', window.location.href);
        const themeUrl = new URL(`themes/${themeName}.json`, baseUrl);
        const res = await fetch(themeUrl.href);
        if (!res.ok) {
            throw new Error(`Failed to load theme: ${res.statusText}`);
        }
        return await res.json();
    } catch (error) {
        console.error(`Error loading theme ${themeName}:`, error);
        return undefined;
    }
}

const customTheme = getCustomThemeName(params.theme);
if (customTheme) {
    loadTheme(customTheme).then(theme => {
        if (theme) {
            monaco.editor.defineTheme("custom", theme);
            monaco.editor.setTheme("custom");
        }
    });
}

const changeBackground = async (color: string, theme?: string) => {
    const fixedColor = color.startsWith("#") ? color : color === "transparent" ? "#00000000" : "#" + color;
    const customTheme = await loadTheme(getCustomThemeName(theme));

    const custombgTheme = {
        base: getBuiltinTheme(theme) ?? getBuiltinTheme(customTheme?.base) ?? 'vs' as any,
        inherit: customTheme?.inherit ?? true,
        rules: customTheme?.rules ?? [],
        colors: {
            ...customTheme?.colors,
            "editor.background": fixedColor,
            "editor.gutter.background": fixedColor,
            "minimap.background": fixedColor,
        },
        encodedTokensColors: customTheme?.encodedTokensColors,
    };

    monaco.editor.defineTheme("custombg", custombgTheme);
    monaco.editor.setTheme("custombg");
}

if (params.background) {
    changeBackground(params.background, params.theme);
}

// Load file from URL if fileUrl parameter is provided
if (params.fileUrl) {
    (async () => {
        try {
            const response = await fetch(params.fileUrl);
            if (!response.ok) {
                throw new Error(`Failed to load file: ${response.status} ${response.statusText}`);
            }
            const content = await response.text();
            
            // Check if we received HTML instead of the expected file content
            // This can happen with dev servers that return HTML for non-existent routes
            /**
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('text/html') && content.includes('<!DOCTYPE') && !params.fileUrl.endsWith('.html')) {
                throw new Error(`Received HTML instead of expected file content. The file may not exist.`);
            }
            */
            
            editor.setValue(content);
        } catch (error) {
            const errorMessage = `Error loading file from ${params.fileUrl}:\n${error instanceof Error ? error.message : String(error)}`;
            console.error(errorMessage);
            editor.setValue(errorMessage);
        }
    })();
}

if (params.javascriptDefaults) {
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: params.javascriptDefaultsNoSemanticValidation === 'true',
        noSyntaxValidation: params.javascriptDefaultsNoSyntaxValidation === 'true',
    });
}

if (params.typescriptDefaults) {
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: params.typescriptDefaultsNoSemanticValidation === 'true',
        noSyntaxValidation: params.typescriptDefaultsNoSyntaxValidation === 'true',
    });
}

editor.onDidChangeModelContent((e) => {
    send({
        type: 'change',
        value: params.dontPostValueOnChange ? null : editor.getModel()?.getValue(),
        e,
    });
});

receive('change-options', e => {
    editor.updateOptions(e.options);
});

receive('change-value', e => {
    editor.setValue(e.value);
});

receive('change-theme', e => {
    monaco.editor.setTheme(e.theme);
});

receive('change-language', e => {
    monaco.editor.setModelLanguage(editor.getModel()!, e.language);
});

receive('change-background', e => {
    changeBackground(e.background, e.theme);
});

receive('get-content', () => {
    send({
        type: 'content',
        value: editor.getModel()?.getValue(),
    });
});

receive('change-javascript-defaults', e => {
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(e.diagnosticsOptions);
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions(e.compilerOptions);
});

receive('change-typescript-defaults', e => {
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(e.diagnosticsOptions);
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(e.compilerOptions);
});

send({
    type: 'ready',
});
