import { useCallback, useEffect, useState } from "react";
import type { CanvasComponent } from "../../shared/types";
import { DesignCanvas } from "./components/DesignCanvas";
import { connect, onConnect, onMessage, send } from "./ws";

type CanvasType = "page" | "component" | "composition";

const CANVAS_TYPES: { id: CanvasType; label: string; placeholder: string }[] = [
	{ id: "page", label: "Page", placeholder: "/about, /dashboard/settings" },
	{
		id: "component",
		label: "Component",
		placeholder: "LoginForm, PricingCard",
	},
	{
		id: "composition",
		label: "Composition",
		placeholder: "Hero + Features + CTA",
	},
];

export function CanvasMode() {
	const [connected, setConnected] = useState(false);
	const [canvasType, setCanvasType] = useState<CanvasType>("page");
	const [canvasName, setCanvasName] = useState("");
	const [canvasContent, setCanvasContent] = useState("");
	const [showContent, setShowContent] = useState(false);

	const currentType =
		CANVAS_TYPES.find((t) => t.id === canvasType) ?? CANVAS_TYPES[0];

	useEffect(() => {
		onConnect(() => {
			send({ type: "REGISTER", role: "canvas" });
			setConnected(true);
		});

		onMessage((msg) => {
			if (msg.type === "CANVAS_CONTEXT") {
				if (msg.canvasType) setCanvasType(msg.canvasType);
				if (msg.canvasName) setCanvasName(msg.canvasName);
				if (msg.canvasContent) setCanvasContent(msg.canvasContent);
			}
		});

		connect();
	}, []);

	const handleSubmit = useCallback(
		(
			imageDataUrl: string,
			width: number,
			height: number,
			canvasComponents?: CanvasComponent[],
		) => {
			send({
				type: "DESIGN_SUBMIT",
				image: imageDataUrl,
				componentName: canvasName.trim() || `New ${canvasType}`,
				target: { tag: "", classes: "", innerText: "" },
				context: canvasContent.trim(),
				insertMode: "after",
				canvasWidth: width,
				canvasHeight: height,
				canvasComponents,
				canvasType,
				canvasName: canvasName.trim(),
				canvasContent: canvasContent.trim(),
			});
		},
		[canvasType, canvasName, canvasContent],
	);

	const handleClose = () => {
		send({ type: "DESIGN_CLOSE" });
	};

	if (!connected) return null;

	return (
		<div className="h-screen w-screen flex flex-col bg-bv-bg">
			{/* Header controls */}
			<div className="shrink-0 px-3 py-2 border-b border-bv-border flex items-center gap-3 flex-wrap">
				{/* Type segmented control */}
				<div className="flex rounded-md border border-bv-border overflow-hidden">
					{CANVAS_TYPES.map((t) => (
						<button
							key={t.id}
							type="button"
							onClick={() => setCanvasType(t.id)}
							className={`px-3 py-1 text-[11px] font-semibold transition-colors ${
								canvasType === t.id
									? "bg-bv-teal text-white"
									: "bg-bv-surface text-bv-text-mid hover:bg-bv-surface-hi hover:text-bv-text"
							}`}
						>
							{t.label}
						</button>
					))}
				</div>

				{/* Name input */}
				<input
					type="text"
					value={canvasName}
					onChange={(e) => setCanvasName(e.target.value)}
					placeholder={currentType.placeholder}
					className="flex-1 min-w-45 max-w-80 px-2 py-1 rounded border border-bv-border bg-bv-surface text-bv-text text-[11px] placeholder:text-bv-muted focus:outline-none focus:border-bv-teal"
				/>

				{/* Content toggle */}
				<button
					type="button"
					onClick={() => setShowContent(!showContent)}
					className="flex items-center gap-1 text-[11px] text-bv-text-mid hover:text-bv-text transition-colors"
				>
					<span
						className={`inline-block transition-transform ${showContent ? "rotate-90" : ""}`}
					>
						▸
					</span>
					Content / Copy
				</button>
			</div>

			{/* Collapsible content area */}
			{showContent && (
				<div className="shrink-0 px-3 py-2 border-b border-bv-border">
					<textarea
						value={canvasContent}
						onChange={(e) => setCanvasContent(e.target.value)}
						placeholder="Describe the content: headings, body text, button labels, data to display…"
						rows={3}
						className="w-full px-2 py-1.5 rounded border border-bv-border bg-bv-surface text-bv-text text-[11px] placeholder:text-bv-muted resize-y focus:outline-none focus:border-bv-teal"
					/>
				</div>
			)}

			{/* Drawing canvas */}
			<div className="flex-1 min-h-0 overflow-hidden">
				<DesignCanvas onSubmit={handleSubmit} onClose={handleClose} />
			</div>
		</div>
	);
}
