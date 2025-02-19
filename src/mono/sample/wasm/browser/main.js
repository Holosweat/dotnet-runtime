import { dotnet, exit } from './dotnet.js'

function add(a, b) {
    return a + b;
}

function sub(a, b) {
    return a - b;
}

let testError = true;
let testAbort = true;
try {
    const { runtimeBuildInfo, setModuleImports, getAssemblyExports, runMain, getConfig } = await dotnet
        .withConsoleForwarding()
        .withElementOnExit()
        .withModuleConfig({
            configSrc: "./mono-config.json",
            imports: {
                fetch: (url, fetchArgs) => {
                    // we are testing that we can retry loading of the assembly
                    if (testAbort && url.indexOf('System.Private.Uri.dll') != -1) {
                        testAbort = false;
                        return fetch(url + "?testAbort=true", fetchArgs);
                    }
                    if (testError && url.indexOf('System.Console.dll') != -1) {
                        testError = false;
                        return fetch(url + "?testError=true", fetchArgs);
                    }
                    return fetch(url, fetchArgs);
                }
            },
            onConfigLoaded: (config) => {
                // This is called during emscripten `dotnet.wasm` instantiation, after we fetched config.
                console.log('user code Module.onConfigLoaded');
                // config is loaded and could be tweaked before the rest of the runtime startup sequence
                config.environmentVariables["MONO_LOG_LEVEL"] = "debug"
            },
            preInit: () => { console.log('user code Module.preInit'); },
            preRun: () => { console.log('user code Module.preRun'); },
            onRuntimeInitialized: () => {
                console.log('user code Module.onRuntimeInitialized');
                // here we could use API passed into this callback
                // Module.FS.chdir("/");
            },
            onDotnetReady: () => {
                // This is called after all assets are loaded.
                console.log('user code Module.onDotnetReady');
            },
            postRun: () => { console.log('user code Module.postRun'); },
        })
        .create();


    // at this point both emscripten and monoVM are fully initialized.
    // we could use the APIs returned and resolved from createDotnetRuntime promise
    // both exports are receiving the same object instances
    console.log('user code after createDotnetRuntime()');
    setModuleImports("main.js", {
        Sample: {
            Test: {
                add,
                sub
            }
        }
    });

    const config = getConfig();
    const exports = await getAssemblyExports(config.mainAssemblyName);
    const meaning = exports.Sample.Test.TestMeaning();
    console.debug(`meaning: ${meaning}`);
    if (!exports.Sample.Test.IsPrime(meaning)) {
        document.getElementById("out").innerHTML = `${meaning} as computed on dotnet ver ${runtimeBuildInfo.productVersion}`;
        console.debug(`ret: ${meaning}`);
    }

    let exit_code = await runMain(config.mainAssemblyName, []);
    exit(exit_code);
}
catch (err) {
    exit(2, err);
}