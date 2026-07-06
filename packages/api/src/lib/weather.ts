/**
 * Thin wrapper around the OpenWeatherMap "current weather" API.
 * Requires OPENWEATHER_API_KEY. If it's missing, every call resolves to
 * null so the app degrades gracefully instead of crashing.
 */

const BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';

export interface WeatherResult {
  temp: number;
  feelsLike: number;
  desc: string;
  icon: string;
  wind: number;
  humidity: number;
  /** Set when conditions look unsafe for boating (storms, high wind, etc) */
  alert: string | null;
}

// Conditions that warrant a proactive "heads up" alert before a rental.
const SEVERE_KEYWORDS = ['thunderstorm', 'storm', 'tornado', 'hurricane', 'squall'];

export async function getCurrentWeather(lat: number, lon: number): Promise<WeatherResult | null> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `${BASE_URL}?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: any = await res.json();

    const main = data?.weather?.[0]?.main?.toLowerCase() ?? '';
    const desc = data?.weather?.[0]?.description ?? 'unknown';
    const windSpeed = Math.round(data?.wind?.speed ?? 0);

    let alert: string | null = null;
    if (SEVERE_KEYWORDS.some(k => main.includes(k) || desc.includes(k))) {
      alert = `Severe weather expected (${desc}). Consider checking with the marina before heading out.`;
    } else if (windSpeed >= 20) {
      alert = `High winds expected (${windSpeed} mph). Conditions may be choppy on the water.`;
    }

    return {
      temp:      Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      desc,
      icon:      `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`,
      wind:      windSpeed,
      humidity:  data.main.humidity,
      alert,
    };
  } catch (err: any) {
    console.error('[weather] fetch failed', err?.message);
    return null;
  }
}
