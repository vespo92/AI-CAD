import {
	useCancelJob,
	useConversionJobs,
} from "@/hooks/use-conversion-queries";
import { cn } from "@/lib/utils/cn";
import { formatFileSize } from "@/lib/utils/format";
import type { ConversionJob } from "@/types/cad";
import { ENGINE_INFO } from "@/types/cad";
import { XMarkIcon } from "@heroicons/react/24/outline";

export function JobList() {
	const { data: jobs, isLoading } = useConversionJobs();
	const cancelJob = useCancelJob();

	if (isLoading) {
		return (
			<div className="p-6 text-center text-gray-500">
				<div className="animate-spin rounded-full h-6 w-6 border-b-2 border-forge-600 mx-auto mb-2" />
				<p className="text-xs">Loading jobs...</p>
			</div>
		);
	}

	if (!jobs?.length) {
		return (
			<div className="p-6 text-center text-gray-500 text-xs">
				No conversion jobs yet. Use the Export panel to start a conversion.
			</div>
		);
	}

	return (
		<div className="space-y-2 p-2">
			{jobs.map((job) => (
				<JobCard
					key={job.id}
					job={job}
					onCancel={() => cancelJob.mutate(job.id)}
				/>
			))}
		</div>
	);
}

function JobCard({
	job,
	onCancel,
}: { job: ConversionJob; onCancel: () => void }) {
	const statusColors = {
		queued: "bg-gray-700 text-gray-300",
		processing: "bg-blue-900/30 text-blue-400",
		completed: "bg-green-900/30 text-green-400",
		failed: "bg-red-900/30 text-red-400",
	};

	return (
		<div className="card p-3">
			<div className="flex items-start justify-between">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-1.5 mb-0.5">
						<p className="text-xs font-medium text-white truncate">
							{job.sourceFile.name}
						</p>
						<span className="text-gray-500">&rarr;</span>
						<span className="text-xs font-mono text-forge-400">
							.{job.targetFormat.toUpperCase()}
						</span>
					</div>

					<div className="flex items-center gap-2 text-[10px] text-gray-500">
						<span>{ENGINE_INFO[job.engine].name}</span>
						<span>&middot;</span>
						<span>{formatFileSize(job.sourceFile.size)}</span>
						{job.llmEnhanced && (
							<>
								<span>&middot;</span>
								<span className="text-amber-400">LLM Enhanced</span>
							</>
						)}
					</div>
				</div>

				<div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
					<span
						className={cn(
							"px-1.5 py-0.5 text-[10px] font-medium rounded-full",
							statusColors[job.status],
						)}
					>
						{job.status}
					</span>

					{(job.status === "queued" || job.status === "processing") && (
						<button
							type="button"
							onClick={onCancel}
							className="p-0.5 text-gray-500 hover:text-red-500 rounded"
							title="Cancel job"
						>
							<XMarkIcon className="h-3.5 w-3.5" />
						</button>
					)}
				</div>
			</div>

			{job.status === "processing" && (
				<div className="mt-2">
					<div className="w-full bg-gray-700 rounded-full h-1">
						<div
							className="bg-forge-600 h-1 rounded-full transition-all duration-500"
							style={{ width: `${job.progress}%` }}
						/>
					</div>
					<p className="text-[10px] text-gray-500 mt-0.5">
						{job.progress}% complete
					</p>
				</div>
			)}

			{job.error && (
				<p className="mt-1.5 text-[10px] text-red-400 bg-red-900/20 p-1.5 rounded">
					{job.error}
				</p>
			)}
		</div>
	);
}
