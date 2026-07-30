'use client';

import { useState, useRef, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useApi } from '@/lib/useApi';

interface ChartPayload {
  type: 'line' | 'bar' | null;
  data: Record<string, unknown>[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  sql?: string;
  chart?: ChartPayload | null;
  rows?: Record<string, unknown>[];
}

const SUGGESTED_PROMPTS = [
  'What was my revenue last month?',
  'Which boats are rarely booked?',
  'Show cancellation trends for the last 6 months',
  'Top 10 customers by revenue',
];

function uid() {
  return Math.random().toString(36).slice(2);
}

/** Picks the first numeric column (other than the label column) to plot. */
function pickChartKeys(data: Record<string, unknown>[]) {
  if (!data.length) return { labelKey: '', valueKey: '' };
  const keys = Object.keys(data[0]);
  const valueKey = keys.find((k) => typeof data[0][k] === 'number') ?? keys[1] ?? keys[0];
  const labelKey = keys.find((k) => k !== valueKey) ?? keys[0];
  return { labelKey, valueKey };
}

function ChartBlock({ chart }: { chart: ChartPayload }) {
  const { labelKey, valueKey } = pickChartKeys(chart.data);
  if (!labelKey || !valueKey) return null;

  return (
    <div className="mt-3 h-56 w-full bg-white rounded-lg border border-gray-100 p-2">
      <ResponsiveContainer width="100%" height="100%">
        {chart.type === 'line' ? (
          <LineChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey={valueKey} stroke="#1d6fdb" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        ) : (
          <BarChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey={valueKey} fill="#1d6fdb" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function ResultTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) return null;
  const columns = Object.keys(rows[0]);
  const preview = rows.slice(0, 10);

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-gray-100">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.map((row, i) => (
            <tr key={i} className="border-t border-gray-100">
              {columns.map((c) => (
                <td key={c} className="px-3 py-2 text-gray-700 whitespace-nowrap">{String(row[c] ?? '—')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > preview.length && (
        <div className="px-3 py-2 text-[11px] text-gray-400 bg-gray-50">
          Showing {preview.length} of {rows.length} rows
        </div>
      )}
    </div>
  );
}

export default function CopilotChat() {
  const api = useApi();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSql, setShowSql] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(uid());

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { id: uid(), role: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const { data } = await api.post('/ai/query', {
        question: trimmed,
        sessionId: sessionId.current,
      });

      const assistantMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        text: data.answer,
        sql: data.sql,
        chart: data.chart,
        rows: data.rows,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const message = err?.response?.data?.error ?? 'Something went wrong answering that question. Please try again.';
      setMessages((prev) => [...prev, { id: uid(), role: 'error', text: message }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[480px] bg-white rounded-xl border border-gray-200">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">AI Analytics Copilot</h2>
        <p className="text-xs text-gray-500">Ask questions about revenue, occupancy, bookings, and customers in plain English.</p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => ask(p)}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:border-brand-400 hover:text-brand-700 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          if (m.role === 'user') {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="bg-brand-600 text-white text-sm rounded-2xl rounded-br-sm px-4 py-2 max-w-[80%]">
                  {m.text}
                </div>
              </div>
            );
          }
          if (m.role === 'error') {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="bg-red-50 text-red-700 text-sm rounded-2xl rounded-bl-sm px-4 py-2 max-w-[85%] border border-red-100">
                  {m.text}
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className="flex justify-start">
              <div className="bg-gray-50 text-gray-800 text-sm rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%] w-full">
                <p>{m.text}</p>

                {m.chart?.data?.length ? <ChartBlock chart={m.chart} /> : null}
                {!m.chart && m.rows && m.rows.length > 1 ? <ResultTable rows={m.rows} /> : null}

                {m.sql && (
                  <div className="mt-2">
                    <button
                      onClick={() => setShowSql((s) => ({ ...s, [m.id]: !s[m.id] }))}
                      className="text-[11px] text-gray-400 hover:text-gray-600 underline"
                    >
                      {showSql[m.id] ? 'Hide SQL' : 'View generated SQL'}
                    </button>
                    {showSql[m.id] && (
                      <pre className="mt-1 text-[11px] bg-gray-900 text-gray-100 rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
                        {m.sql}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-50 text-gray-400 text-sm rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="border-t border-gray-100 p-3 flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about revenue, occupancy, bookings..."
          className="flex-1 text-sm px-4 py-2.5 rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
          disabled={loading}
          maxLength={500}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-brand-600 text-white text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-brand-700 transition-colors disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
