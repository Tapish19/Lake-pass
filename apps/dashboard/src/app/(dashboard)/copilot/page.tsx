import CopilotChat from '@/components/ai/CopilotChat';

export default function CopilotPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">AI Analytics Copilot</h1>
        <p className="text-gray-500">Ask natural-language questions about your marina&apos;s performance.</p>
      </div>
      <CopilotChat />
    </div>
  );
}
