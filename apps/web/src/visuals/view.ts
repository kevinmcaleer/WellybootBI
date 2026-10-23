// The Vega view of the chart on screen: what export draws from, and what the browser tests read the bars from.
import type { View } from 'vega';

let current: View | null = null;

export const setChartView = (view: View | null) => {
  current = view;
};

export const chartView = () => current;
