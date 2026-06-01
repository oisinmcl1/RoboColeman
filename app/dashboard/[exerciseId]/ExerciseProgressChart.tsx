'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ExerciseProgressPoint } from '@/lib/dashboard';

type Props = {
  name: string;
  series: ExerciseProgressPoint[];
};

// Short axis label like "5 Apr" from the point's ISO date string.
const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

// Client Component: Recharts needs the browser (SVG + measured layout), so the
// chart can't live in a Server Component. It receives an already-computed,
// fully-serialisable series as props — it does no data access itself.
export default function ExerciseProgressChart({ name, series }: Props) {
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-xl font-semibold">{name}</h1>

      {series.length === 0 ? (
        // Graceful empty state — a friendly note instead of an empty axis frame.
        <div className="rounded border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          No data yet — log a session with this exercise and your progress will
          show up here.
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600">Working weight over time</p>

          {/* ResponsiveContainer fills the phone width; fixed height keeps the
              aspect sensible on small screens. */}
          <div className="rounded border border-gray-200 p-2">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={series}
                margin={{ top: 8, right: 12, bottom: 4, left: -8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 12 }}
                  minTickGap={16}
                />
                <YAxis
                  width={40}
                  tick={{ fontSize: 12 }}
                  unit="kg"
                  domain={['dataMin - 5', 'dataMax + 5']}
                  allowDecimals={false}
                />
                <Tooltip
                  labelFormatter={(label) => formatDate(String(label))}
                  formatter={(value, name) => [
                    `${value} kg`,
                    name === 'workingWeightKg' ? 'Working weight' : 'Volume',
                  ]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="workingWeightKg"
                  name="Working weight"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs text-gray-500">
            {`${series.length} session${series.length === 1 ? '' : 's'} logged. ` +
              `Tap a point for that session's weight and volume.`}
          </p>
        </>
      )}
    </main>
  );
}