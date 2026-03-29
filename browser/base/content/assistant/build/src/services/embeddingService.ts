/**
 * Embedding Service — Content Process with Script Injection
 * 
 * Creates a hidden <browser type="content" remote="true"> that loads
 * about:blank, then the frame script injects Transformers.js as an
 * ES module that imports from CDN.
 * 
 * This gives us:
 * 1. Content process isolation → WASM doesn't crash the browser
 * 2. Frame script injection → no separate HTML page needed
 * 3. ES module import from CDN → ONNX backend resolves correctly
 */

const VECTOR_DIMENSIONS = 384;
const FRAME_SCRIPT_URL = "chrome://browser/content/assistant/embedding-frame-script.js";

interface PendingRequest {
    resolve: (embedding: number[]) => void;
    reject: (error: Error) => void;
}

class EmbeddingService {
    private browser: any = null;
    private ready = false;
    private modelLoaded = false;
    private readyPromise: Promise<void> | null = null;
    private pendingRequests = new Map<string, PendingRequest>();
    private requestCounter = 0;

    private async ensureBrowser(): Promise<void> {
        if (this.ready) return;
        if (this.readyPromise) {
            await this.readyPromise;
            return;
        }

        this.readyPromise = new Promise<void>((resolve, reject) => {
            console.log("[EmbeddingService] Creating remote content browser...");

            try {
                const Services = (window as any).Services
                    || (window as any).top?.Services
                    || (globalThis as any).Services;

                const browserWin = Services?.wm?.getMostRecentWindow("navigator:browser");

                if (!browserWin) {
                    reject(new Error("Could not find main browser window"));
                    return;
                }

                this.browser = browserWin.document.createXULElement("browser");
                this.browser.setAttribute("type", "content");
                this.browser.setAttribute("remote", "true");
                this.browser.setAttribute("src", "about:blank");
                this.browser.style.cssText = "display:none; width:0; height:0; position:fixed; visibility:hidden;";

                browserWin.document.documentElement.appendChild(this.browser);
                console.log("[EmbeddingService] Browser element appended, waiting for init...");

                // Wait for the browser to initialize, then load frame script
                setTimeout(() => {
                    try {
                        if (!this.browser.messageManager) {
                            console.error("[EmbeddingService] messageManager not available after timeout");
                            reject(new Error("messageManager not available"));
                            return;
                        }

                        console.log("[EmbeddingService] Loading frame script...");
                        this.browser.messageManager.loadFrameScript(FRAME_SCRIPT_URL, false);

                        this.browser.messageManager.addMessageListener("EmbedWorkerReady", () => {
                            if (this.ready) return;
                            console.log("[EmbeddingService] ✅ Worker ready in content process!");
                            this.ready = true;
                            resolve();
                        });

                        this.browser.messageManager.addMessageListener("EmbedModelLoaded", () => {
                            console.log("[EmbeddingService] Model loaded in content process");
                            this.modelLoaded = true;
                        });

                        this.browser.messageManager.addMessageListener("EmbedResponse", (msg: any) => {
                            const { id, embedding, error } = msg.data;
                            const pending = this.pendingRequests.get(id);
                            if (pending) {
                                this.pendingRequests.delete(id);
                                if (error) {
                                    pending.reject(new Error(error));
                                } else {
                                    pending.resolve(embedding);
                                }
                            }
                        });

                        console.log("[EmbeddingService] Message listeners set up");

                    } catch (err) {
                        console.error("[EmbeddingService] Setup failed:", err);
                        reject(err as Error);
                    }
                }, 1000); // Allow browser element to fully initialize

                setTimeout(() => {
                    if (!this.ready) {
                        console.error("[EmbeddingService] Timeout: never received EmbedWorkerReady");
                        reject(new Error("Embedding browser failed to initialize within 60s"));
                    }
                }, 60000);

            } catch (err) {
                console.error("[EmbeddingService] Failed to create browser:", err);
                reject(err as Error);
            }
        });

        await this.readyPromise;
    }

    async embed(text: string): Promise<number[]> {
        await this.ensureBrowser();
        const id = `embed-${++this.requestCounter}`;

        return new Promise<number[]>((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.browser.messageManager.sendAsyncMessage("EmbedRequest", { id, text });

            const timeout = this.modelLoaded ? 30000 : 120000;
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Embedding timed out after ${timeout / 1000}s`));
                }
            }, timeout);
        });
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        const results: number[][] = [];
        for (const text of texts) {
            results.push(await this.embed(text));
        }
        return results;
    }

    /**
     * Start loading the model in the background.
     * Does not block — just kicks off the download.
     * If it fails, no harm done — ensureBrowser() will retry on first search.
     */
    preload(): void {
        if (this.ready || this.readyPromise) return; // Already loading or loaded

        console.log("[EmbeddingService] 🚀 Background pre-warming started...");
        this.ensureBrowser().catch(err => {
            console.warn("[EmbeddingService] Pre-warming failed (will retry on search):", err);
            // Reset so ensureBrowser() tries again on actual search
            this.readyPromise = null;
        });
    }

    isLoaded(): boolean {
        return this.modelLoaded;
    }
}

export const embeddingService = new EmbeddingService();
export { VECTOR_DIMENSIONS };
