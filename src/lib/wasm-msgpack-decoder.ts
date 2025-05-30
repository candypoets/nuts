import init, {
	decode_msgpack,
	decode_msgpack_batch,
	encode_msgpack
} from './wasm-msgpack/wasm_msgpack.js';

class WasmMsgpackDecoder {
	private initialized = false;
	private initPromise: Promise<void> | null = null;

	async init() {
		if (this.initialized) return;
		if (this.initPromise) return this.initPromise;

		this.initPromise = this.doInit();
		await this.initPromise;
	}

	private async doInit() {
		try {
			await init('/wasm_msgpack.wasm');
			this.initialized = true;
		} catch (error) {
			console.error('Failed to initialize WASM msgpack decoder:', error);
			throw error;
		}
	}

	async decode(data: Uint8Array): Promise<any> {
		await this.init();
		try {
			const jsonString = decode_msgpack(data);
			return JSON.parse(jsonString);
		} catch (error) {
			throw error;
		}
	}

	async decodeBatch(data: Uint8Array): Promise<any[]> {
		await this.init();
		try {
			const jsonString = decode_msgpack_batch(data);
			const result = JSON.parse(jsonString);
			return Array.isArray(result) ? result : [result];
		} catch (error) {
			// Fallback to single decode
			try {
				const singleResult = await this.decode(data);
				return Array.isArray(singleResult) ? singleResult : [singleResult];
			} catch (fallbackError) {
				throw error;
			}
		}
	}

	async encode(data: any): Promise<Uint8Array> {
		await this.init();
		try {
			const jsonString = JSON.stringify(data);
			return new Uint8Array(encode_msgpack(jsonString));
		} catch (error) {
			throw error;
		}
	}
}

// Export singleton instance
export const wasmMsgpack = new WasmMsgpackDecoder();

// Export for direct use if needed
export { WasmMsgpackDecoder };
