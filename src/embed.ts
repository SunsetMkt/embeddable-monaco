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

// 初始化编辑器选项，但暂不设置 value
const options: monaco.editor.IStandaloneEditorConstructionOptions = {
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

// 从 URL 加载文件内容的函数
const loadFileFromUrl = async (url: string): Promise<string> => {
    try {
        console.log(`Loading file from URL: ${url}`);
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to load file: ${response.status} ${response.statusText}`);
        }
        
        return await response.text();
    } catch (error) {
        console.error(`Error loading file from URL: ${error}`);
        throw error;
    }
};

// 初始化编辑器内容
const initializeEditorContent = async (): Promise<string> => {
    // 如果提供了 fileUrl 参数，尝试从 URL 加载内容
    if (params.fileUrl) {
        try {
            return await loadFileFromUrl(params.fileUrl);
        } catch (error) {
            console.warn(`Failed to load content from fileUrl, falling back to code parameter: ${error}`);
            // 如果加载失败，回退到 code 参数
            return params.code ?? '';
        }
    }
    
    // 如果没有 fileUrl 参数，使用 code 参数
    return params.code ?? '';
};

// 获取当前脚本的基础路径，用于相对路径加载
const getBasePath = () => {
    // 获取当前脚本的URL
    const scripts = document.getElementsByTagName('script');
    const currentScript = scripts[scripts.length - 1];
    const scriptSrc = currentScript.src;
    
    // 提取基础路径（去掉文件名部分）
    const basePath = scriptSrc.substring(0, scriptSrc.lastIndexOf('/') + 1);
    return basePath.substring(0, basePath.lastIndexOf('/src/') + 1); // 回到项目根目录
};

// 异步初始化编辑器
const initializeEditor = async () => {
    try {
        // 获取编辑器内容
        const content = await initializeEditorContent();
        
        // 设置编辑器内容
        options.value = content;
        
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
            
            // 使用相对路径加载主题文件
            const basePath = getBasePath();
            const themePath = `${basePath}themes/${themeName}.json`;
            console.log(`Loading theme from: ${themePath}`);
            
            return fetch(themePath).then(res => res.json());
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
                base: getBuiltinTheme(theme) ?? (customTheme && getBuiltinTheme(customTheme.base)) ?? 'vs' as any,
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
    } catch (error) {
        console.error(`Error initializing editor: ${error}`);
        // 如果初始化失败，创建一个基本编辑器
        options.value = `// Error loading content: ${error}\n// Please check the console for more details.`;
        const editor = monaco.editor.create(document.getElementById('root') ?? document.body, options);
        
        send({
            type: 'ready',
            error: `${error}`,
        });
    }
};

// 启动编辑器初始化
initializeEditor();
