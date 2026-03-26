import { useCadEngine } from "@/hooks/use-cad-engine";
import { buildLlmMessages, extractCodeBlock } from "@/lib/api/cad-prompt";
import { streamChat } from "@/lib/api/llm-client";
import { useCadStore } from "@/lib/store/cad-store";
import { cn } from "@/lib/utils/cn";
import type { ChatMessage } from "@/types/cad";
import { PaperAirplaneIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";

interface ChatPanelProps {
	className?: string;
}

export function ChatPanel({ className }: ChatPanelProps) {
	const messages = useCadStore((s) => s.chatMessages);
	const isLoading = useCadStore((s) => s.isChatLoading);
	const addMessage = useCadStore((s) => s.addChatMessage);
	const setChatLoading = useCadStore((s) => s.setChatLoading);
	const clearChat = useCadStore((s) => s.clearChat);
	const setEditorCode = useCadStore((s) => s.setEditorCode);
	const setActiveBottomTab = useCadStore((s) => s.setActiveBottomTab);
	const editorCode = useCadStore((s) => s.editorCode);
	const { execute } = useCadEngine();
	const [input, setInput] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll when messages array changes
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	const handleSubmit = useCallback(async () => {
		const trimmed = input.trim();
		if (!trimmed || isLoading) return;

		addMessage({ role: "user", content: trimmed });
		setInput("");
		setChatLoading(true);

		try {
			// Build LLM message history
			const currentMessages = useCadStore.getState().chatMessages;
			const llmMessages = buildLlmMessages(currentMessages, editorCode);

			// Stream the response
			let fullResponse = "";

			// Add empty assistant message that we'll update
			addMessage({ role: "assistant", content: "" });

			for await (const chunk of streamChat(llmMessages)) {
				if (chunk.done) break;
				fullResponse += chunk.content;

				// Update the last assistant message in-place
				useCadStore.setState((s) => {
					const msgs = [...s.chatMessages];
					for (let i = msgs.length - 1; i >= 0; i--) {
						if (msgs[i].role === "assistant") {
							msgs[i] = { ...msgs[i], content: fullResponse };
							break;
						}
					}
					return { chatMessages: msgs };
				});
			}

			// Extract code block from the response
			const code = extractCodeBlock(fullResponse);
			if (code) {
				// Update the message with the code block
				useCadStore.setState((s) => {
					const msgs = [...s.chatMessages];
					for (let i = msgs.length - 1; i >= 0; i--) {
						if (msgs[i].role === "assistant") {
							msgs[i] = { ...msgs[i], codeBlock: code };
							break;
						}
					}
					return { chatMessages: msgs };
				});

				// Auto-execute: set code in editor and run it
				setEditorCode(code);
				setActiveBottomTab("code");
				addMessage({
					role: "system",
					content: "Auto-executing generated code...",
				});
				await execute(code);
			}
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to get response";
			addMessage({ role: "system", content: `LLM Error: ${message}` });
		} finally {
			setChatLoading(false);
		}
	}, [
		input,
		isLoading,
		addMessage,
		setChatLoading,
		editorCode,
		execute,
		setEditorCode,
		setActiveBottomTab,
	]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	return (
		<div className={cn("flex flex-col", className)}>
			{/* Messages */}
			<div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
				{messages.map((message) => (
					<MessageBubble
						key={message.id}
						message={message}
						onApplyCode={(code) => {
							setEditorCode(code);
							setActiveBottomTab("code");
						}}
					/>
				))}
				{isLoading && (
					<div className="flex items-center gap-2 text-gray-400 text-sm px-2">
						<div className="flex gap-1">
							<span className="w-1.5 h-1.5 bg-forge-500 rounded-full animate-bounce" />
							<span
								className="w-1.5 h-1.5 bg-forge-500 rounded-full animate-bounce"
								style={{ animationDelay: "0.15s" }}
							/>
							<span
								className="w-1.5 h-1.5 bg-forge-500 rounded-full animate-bounce"
								style={{ animationDelay: "0.3s" }}
							/>
						</div>
						<span>Thinking...</span>
					</div>
				)}
				<div ref={messagesEndRef} />
			</div>

			{/* Input */}
			<div className="px-3 py-2 border-t border-gray-700">
				<div className="flex items-end gap-2">
					<textarea
						ref={inputRef}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Describe what you want to build..."
						rows={1}
						className="flex-1 input resize-none min-h-[36px] max-h-[120px] py-2"
					/>
					<button
						type="button"
						onClick={handleSubmit}
						disabled={!input.trim() || isLoading}
						className="btn-primary p-2"
						title="Send message"
					>
						<PaperAirplaneIcon className="w-4 h-4" />
					</button>
					<button
						type="button"
						onClick={clearChat}
						className="btn-ghost p-2"
						title="Clear chat"
					>
						<TrashIcon className="w-4 h-4" />
					</button>
				</div>
				{!import.meta.env.VITE_LLM_API_KEY && (
					<p className="text-[10px] text-gray-600 mt-1">
						Set VITE_LLM_API_KEY to enable AI chat
					</p>
				)}
			</div>
		</div>
	);
}

function MessageBubble({
	message,
	onApplyCode,
}: { message: ChatMessage; onApplyCode?: (code: string) => void }) {
	const isUser = message.role === "user";
	const isSystem = message.role === "system";

	return (
		<div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
			<div
				className={cn(
					"max-w-[85%] rounded-lg px-3 py-2 text-sm",
					isUser && "bg-forge-600/80 text-white",
					!isUser && !isSystem && "bg-gray-700 text-gray-200",
					isSystem && "bg-gray-800/50 text-gray-400 text-xs italic",
				)}
			>
				<p className="whitespace-pre-wrap">{message.content}</p>
				{message.codeBlock && (
					<div className="mt-2">
						<pre className="bg-black/30 rounded p-2 text-xs font-mono overflow-x-auto">
							{message.codeBlock}
						</pre>
						{onApplyCode && (
							<button
								type="button"
								onClick={() =>
									message.codeBlock && onApplyCode(message.codeBlock)
								}
								className="mt-1 text-[10px] text-forge-400 hover:text-forge-300"
							>
								Apply to editor
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
