import { interopSafeParseAsync } from "@langchain/core/utils/types";
import { BaseLLMOutputParser, OutputParserException } from "@langchain/core/output_parsers";
//#region src/output_parsers.ts
var AnthropicToolsOutputParser = class extends BaseLLMOutputParser {
	static lc_name() {
		return "AnthropicToolsOutputParser";
	}
	lc_namespace = [
		"langchain",
		"anthropic",
		"output_parsers"
	];
	returnId = false;
	/** The type of tool calls to return. */
	keyName;
	/** Whether to return only the first tool call. */
	returnSingle = false;
	zodSchema;
	serializableSchema;
	constructor(params) {
		super(params);
		this.keyName = params.keyName;
		this.returnSingle = params.returnSingle ?? this.returnSingle;
		this.zodSchema = params.zodSchema;
		this.serializableSchema = params.serializableSchema;
	}
	async _validateResult(result) {
		let parsedResult = result;
		if (typeof result === "string") try {
			parsedResult = JSON.parse(result);
		} catch (e) {
			throw new OutputParserException(`Failed to parse. Text: "${JSON.stringify(result, null, 2)}". Error: ${JSON.stringify(e.message)}`, result);
		}
		else parsedResult = result;
		if (this.serializableSchema !== void 0) {
			const validated = await this.serializableSchema["~standard"].validate(parsedResult);
			if (validated.issues) throw new OutputParserException(`Failed to parse. Text: "${JSON.stringify(parsedResult, null, 2)}". Error: ${JSON.stringify(validated.issues)}`, JSON.stringify(parsedResult, null, 2));
			return validated.value;
		}
		if (this.zodSchema === void 0) return parsedResult;
		const zodParsedResult = await interopSafeParseAsync(this.zodSchema, parsedResult);
		if (zodParsedResult.success) return zodParsedResult.data;
		else throw new OutputParserException(`Failed to parse. Text: "${JSON.stringify(result, null, 2)}". Error: ${JSON.stringify(zodParsedResult.error.issues)}`, JSON.stringify(parsedResult, null, 2));
	}
	async parseResult(generations) {
		const tools = generations.flatMap((generation) => {
			const { message } = generation;
			if (!Array.isArray(message.content)) return [];
			return extractToolCalls(message.content)[0];
		});
		if (tools[0] === void 0) throw new Error("No parseable tool calls provided to AnthropicToolsOutputParser.");
		const [tool] = tools;
		return await this._validateResult(tool.args);
	}
};
function extractToolCalls(content) {
	const toolCalls = [];
	for (const block of content) if (block.type === "tool_use") toolCalls.push({
		name: block.name,
		args: block.input,
		id: block.id,
		type: "tool_call"
	});
	return toolCalls;
}
//#endregion
export { AnthropicToolsOutputParser, extractToolCalls };

//# sourceMappingURL=output_parsers.js.map