import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE = '/api'
const DEFAULT_APP_NAME = 'WeatherPlanner'

const weatherDescriptions = {
  0: 'Clear sky',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Dense drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Heavy showers',
  82: 'Violent showers',
  95: 'Thunderstorm',
}

function App() {
  const [appName, setAppName] = useState(
    () => localStorage.getItem('weather-app-name') || DEFAULT_APP_NAME,
  )
  const [authMode, setAuthMode] = useState('sign-in')
  const [authForm, setAuthForm] = useState({
    email: '',
    password: '',
  })
  const [token, setToken] = useState(() => localStorage.getItem('weather-token') || '')
  const [email, setEmail] = useState(() => localStorage.getItem('weather-email') || '')
  const [city, setCity] = useState('Kyiv')
  const [savedCity, setSavedCity] = useState('')
  const [weather, setWeather] = useState(null)
  const [notificationSettings, setNotificationSettings] = useState({
    minTemp: '10',
    maxTemp: '26',
    notifyRain: true,
  })
  const [plans, setPlans] = useState(() => {
    const saved = localStorage.getItem('weather-plans')
    return saved ? parseJson(saved) : []
  })
  const [planForm, setPlanForm] = useState({
    date: '',
    time: '09:00',
    title: '',
    description: '',
  })
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const current = useMemo(() => normalizeCurrent(weather?.current), [weather])
  const dailyRows = useMemo(() => buildDailyRows(weather?.daily), [weather])
  const hourlyRows = useMemo(() => buildHourlyRows(weather?.hourly), [weather])
  const isSignedIn = Boolean(token)
  const selectedPlanDate = planForm.date || dailyRows[0]?.time || ''

  useEffect(() => {
    const cleanName = appName.trim() || DEFAULT_APP_NAME
    localStorage.setItem('weather-app-name', cleanName)
    document.title = cleanName
  }, [appName])

  useEffect(() => {
    localStorage.setItem('weather-plans', JSON.stringify(plans))
  }, [plans])

  useEffect(() => {
    if (token) {
      loadPlans()
    } else {
      setPlans([])
    }
  }, [token])

  async function request(path, options = {}) {
    const headers = {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token && !options.public ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    }

    const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
    const text = await response.text()
    const payload = text ? parseJson(text) : null

    if (!response.ok) {
      const message =
        payload?.message || payload?.error || text || `Request failed: ${response.status}`
      throw new Error(message)
    }

    return payload ?? text
  }

  async function handleAuth(event) {
    event.preventDefault()
    setIsBusy(true)
    setError('')
    setStatus('')

    try {
      const cleanEmail = authForm.email.trim().toLowerCase()
      const path = authMode === 'sign-up' ? '/auth/sign-up' : '/auth/sign-in'
      const body =
        authMode === 'sign-up'
          ? {
              username: cleanEmail.split('@')[0] || 'user',
              email: cleanEmail,
              password: authForm.password,
            }
          : {
              email: cleanEmail,
              password: authForm.password,
            }

      const data = await request(path, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {},
        public: true,
      })

      localStorage.setItem('weather-token', data.token)
      localStorage.setItem('weather-email', cleanEmail)
      setToken(data.token)
      setEmail(cleanEmail)
      setStatus(authMode === 'sign-up' ? 'Account created.' : 'Signed in.')
    } catch (authError) {
      setError(authError.message)
    } finally {
      setIsBusy(false)
    }
  }

  async function loadWeather(event) {
    event?.preventDefault()
    if (!city.trim()) return

    setIsBusy(true)
    setError('')
    setStatus('')

    try {
      const data = await request(`/weather?city=${encodeURIComponent(city.trim())}`)
      setWeather(data)
      setStatus(`Weather loaded for ${city.trim()}.`)
    } catch (weatherError) {
      setError(weatherError.message)
    } finally {
      setIsBusy(false)
    }
  }

  async function saveLocation(event) {
    event.preventDefault()
    if (!email || !savedCity.trim()) {
      setError('Sign in and enter a city before saving your location.')
      return
    }

    setIsBusy(true)
    setError('')
    setStatus('')

    try {
      await request(
        `/set-location?email=${encodeURIComponent(email)}&city=${encodeURIComponent(
          savedCity.trim(),
        )}`,
        { method: 'POST' },
      )
      setStatus(`${savedCity.trim()} saved as your location.`)
    } catch (locationError) {
      setError(locationError.message)
    } finally {
      setIsBusy(false)
    }
  }

  async function loadNotificationSettings() {
    setIsBusy(true)
    setError('')
    setStatus('')

    try {
      const data = await request('/notification-rules')
      if (!data) {
        setStatus('No notification settings saved yet.')
        return
      }

      setNotificationSettings({
        minTemp: data.minTemp ?? '',
        maxTemp: data.maxTemp ?? '',
        notifyRain: Boolean(data.notifyRain),
      })
      setStatus('Notification settings loaded.')
    } catch (settingsError) {
      setError(settingsError.message)
    } finally {
      setIsBusy(false)
    }
  }

  async function loadPlans() {
    setError('')

    try {
      const data = await request('/plans')
      setPlans(Array.isArray(data) ? data : [])
    } catch (plansError) {
      setError(plansError.message)
    }
  }

  async function saveNotificationSettings(event) {
    event.preventDefault()
    setIsBusy(true)
    setError('')
    setStatus('')

    try {
      await request('/notification-rules', {
        method: 'POST',
        body: JSON.stringify({
          minTemp: toNumberOrNull(notificationSettings.minTemp),
          maxTemp: toNumberOrNull(notificationSettings.maxTemp),
          notifyRain: notificationSettings.notifyRain,
        }),
      })
      setStatus('Notification settings saved.')
    } catch (settingsError) {
      setError(settingsError.message)
    } finally {
      setIsBusy(false)
    }
  }

  function signOut() {
    localStorage.removeItem('weather-token')
    localStorage.removeItem('weather-email')
    setToken('')
    setEmail('')
    setWeather(null)
    setStatus('Signed out.')
  }

  async function addPlan(event) {
    event.preventDefault()
    if (!selectedPlanDate || !planForm.title.trim()) {
      setError('Choose a date and add a title for your plan.')
      return
    }

    const selectedDay = dailyRows.find((day) => day.time === selectedPlanDate)

    setIsBusy(true)
    setError('')
    setStatus('')

    try {
      const savedPlan = await request('/plans', {
        method: 'POST',
        body: JSON.stringify({
          date: selectedPlanDate,
          time: planForm.time,
          title: planForm.title.trim(),
          description: planForm.description.trim(),
          city: city.trim(),
          weatherCode: selectedDay?.weatherCode ?? null,
          tempMax: selectedDay?.tempMax ?? null,
          tempMin: selectedDay?.tempMin ?? null,
          rainSum: selectedDay?.rainSum ?? null,
        }),
      })

      setPlans((currentPlans) =>
        [...currentPlans, savedPlan].sort((first, second) =>
          `${first.date} ${first.time}`.localeCompare(`${second.date} ${second.time}`),
        ),
      )
      setPlanForm((currentForm) => ({
        ...currentForm,
        date: selectedPlanDate,
        title: '',
        description: '',
      }))
      setStatus('Plan added. Weather alerts will watch this day against your comfort settings.')
    } catch (planError) {
      setError(planError.message)
    } finally {
      setIsBusy(false)
    }
  }

  async function removePlan(planId) {
    setIsBusy(true)
    setError('')
    setStatus('')

    try {
      await request(`/plans/${planId}`, { method: 'DELETE' })
      setPlans((currentPlans) => currentPlans.filter((plan) => plan.id !== planId))
      setStatus('Plan removed.')
    } catch (planError) {
      setError(planError.message)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="Application status">
        <div>
          <p className="eyebrow">Planning weather</p>
          <h1>{appName.trim() || DEFAULT_APP_NAME}</h1>
        </div>
        <div className="topbar-actions">
          <label className="brand-editor">
            App name
            <input
              value={appName}
              onChange={(event) => setAppName(event.target.value)}
              placeholder={DEFAULT_APP_NAME}
              maxLength="32"
            />
          </label>
          <div className="session-box">
            <span className={isSignedIn ? 'status-dot live' : 'status-dot'}></span>
            <span>{isSignedIn ? `Signed in as ${email}` : 'Sign in to use weather search'}</span>
            {isSignedIn && (
              <button className="ghost-button" type="button" onClick={signOut}>
                Sign out
              </button>
            )}
          </div>
        </div>
      </section>

      {(status || error) && (
        <section className={error ? 'notice error' : 'notice'} role="status">
          {error || status}
        </section>
      )}

      <section className="workspace-grid">
        <aside className="control-panel">
          <section className="panel-section">
            <div className="section-heading">
              <span className="section-icon">A</span>
              <div>
                <h2>Account</h2>
                <p>Sign in or create an account.</p>
              </div>
            </div>

            <div className="segmented" aria-label="Authentication mode">
              <button
                type="button"
                className={authMode === 'sign-in' ? 'active' : ''}
                onClick={() => setAuthMode('sign-in')}
              >
                Sign in
              </button>
              <button
                type="button"
                className={authMode === 'sign-up' ? 'active' : ''}
                onClick={() => setAuthMode('sign-up')}
              >
                Sign up
              </button>
            </div>

            <form className="stacked-form" onSubmit={handleAuth}>
              <label>
                Email
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                  placeholder="you@example.com"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  minLength="8"
                  value={authForm.password}
                  onChange={(event) =>
                    setAuthForm({ ...authForm, password: event.target.value })
                  }
                  placeholder="At least 8 characters"
                  required
                />
              </label>
              <button className="primary-button" type="submit" disabled={isBusy}>
                {authMode === 'sign-up' ? 'Create account' : 'Sign in'}
              </button>
            </form>
          </section>

          <section className="panel-section">
            <div className="section-heading">
              <span className="section-icon">L</span>
              <div>
                <h2>Location</h2>
                <p>Save a default city for your account.</p>
              </div>
            </div>

            <form className="stacked-form compact" onSubmit={saveLocation}>
              <label>
                City
                <input
                  value={savedCity}
                  onChange={(event) => setSavedCity(event.target.value)}
                  placeholder="Lviv"
                />
              </label>
              <button className="secondary-button" type="submit" disabled={!isSignedIn || isBusy}>
                Save location
              </button>
            </form>
          </section>

          <section className="panel-section">
            <div className="section-heading">
              <span className="section-icon">N</span>
              <div>
                <h2>Notifications</h2>
                <p>Set comfort limits for weather alerts.</p>
              </div>
            </div>

            <form className="comfort-form" onSubmit={saveNotificationSettings}>
              <label>
                Cold below
                <input
                  type="number"
                  step="0.5"
                  value={notificationSettings.minTemp}
                  onChange={(event) =>
                    setNotificationSettings({
                      ...notificationSettings,
                      minTemp: event.target.value,
                    })
                  }
                  placeholder="10"
                />
              </label>
              <label>
                Hot above
                <input
                  type="number"
                  step="0.5"
                  value={notificationSettings.maxTemp}
                  onChange={(event) =>
                    setNotificationSettings({
                      ...notificationSettings,
                      maxTemp: event.target.value,
                    })
                  }
                  placeholder="26"
                />
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={notificationSettings.notifyRain}
                  onChange={(event) =>
                    setNotificationSettings({
                      ...notificationSettings,
                      notifyRain: event.target.checked,
                    })
                  }
                />
                Rain alerts
              </label>
              <div className="button-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={loadNotificationSettings}
                  disabled={!isSignedIn || isBusy}
                >
                  Load
                </button>
                <button className="primary-button" type="submit" disabled={!isSignedIn || isBusy}>
                  Save
                </button>
              </div>
            </form>
          </section>
        </aside>

        <section className="weather-panel">
          <form className="search-bar" onSubmit={loadWeather}>
            <label>
              City weather
              <input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Search city"
              />
            </label>
            <button className="primary-button" type="submit" disabled={!isSignedIn || isBusy}>
              Search
            </button>
          </form>

          <section className="current-weather">
            <div className="weather-visual" aria-hidden="true">
              <div className={current?.isDay === 0 ? 'moon' : 'sun'}></div>
              <div className="cloud one"></div>
              <div className="cloud two"></div>
              <div className="rain-lines"></div>
            </div>
            <div className="current-copy">
              <p className="eyebrow">
                {weather ? weather.timezone : 'Backend should run on localhost:8080'}
              </p>
              <h2>{weather ? city : 'Search a city'}</h2>
              <div className="temperature">
                {formatNumber(current?.temperature)}
                <span>deg C</span>
              </div>
              <p>
                {describeWeather(current?.weatherCode)}. Feels like{' '}
                {formatNumber(current?.feelsLike)} deg C
              </p>
            </div>
          </section>

          <section className="metrics-grid" aria-label="Current weather metrics">
            <Metric label="Humidity" value={`${fallback(current?.humidity)}%`} />
            <Metric label="Wind" value={`${formatNumber(current?.windSpeed)} km/h`} />
            <Metric label="Rain" value={`${formatNumber(current?.rain)} mm`} />
            <Metric label="Coordinates" value={formatCoordinates(weather)} />
          </section>

          <section className="forecast-section">
            <div className="section-title-row">
              <h2>Daily forecast</h2>
              <span>{dailyRows.length ? `${dailyRows.length} days` : 'No data yet'}</span>
            </div>
            <div className="daily-list">
              {dailyRows.map((day) => (
                <article className="forecast-card" key={day.time}>
                  <span>{formatDate(day.time)}</span>
                  <strong>
                    {formatNumber(day.tempMin)} / {formatNumber(day.tempMax)} deg C
                  </strong>
                  <small>{describeWeather(day.weatherCode)}</small>
                  <small>Rain {formatNumber(day.rainSum)} mm</small>
                </article>
              ))}
              {!dailyRows.length && <EmptyState text="Sign in and search a city." />}
            </div>
          </section>

          <section className="forecast-section">
            <div className="section-title-row">
              <h2>Next hours</h2>
              <span>{hourlyRows.length ? 'First 8 records' : 'No data yet'}</span>
            </div>
            <div className="hourly-table">
              {hourlyRows.map((hour) => (
                <div className="hour-row" key={hour.time}>
                  <span>{formatHour(hour.time)}</span>
                  <strong>{formatNumber(hour.temperature)} deg C</strong>
                  <span>{fallback(hour.humidity)}% humidity</span>
                  <span>{formatNumber(hour.windSpeed)} km/h</span>
                </div>
              ))}
              {!hourlyRows.length && <EmptyState text="Hourly weather will appear here." />}
            </div>
          </section>

          <section className="calendar-section">
            <div className="section-title-row">
              <h2>Plans calendar</h2>
              <span>{plans.length ? `${plans.length} plans` : 'No plans yet'}</span>
            </div>

            <form className="plan-form" onSubmit={addPlan}>
              <label>
                Day
                <select
                  value={selectedPlanDate}
                  onChange={(event) => setPlanForm({ ...planForm, date: event.target.value })}
                >
                  {dailyRows.map((day) => (
                    <option value={day.time} key={day.time}>
                      {formatDate(day.time)}
                    </option>
                  ))}
                  {!dailyRows.length && <option value="">Search weather first</option>}
                </select>
              </label>
              <label>
                Time
                <input
                  type="time"
                  value={planForm.time}
                  onChange={(event) => setPlanForm({ ...planForm, time: event.target.value })}
                />
              </label>
              <label>
                Plan
                <input
                  value={planForm.title}
                  onChange={(event) => setPlanForm({ ...planForm, title: event.target.value })}
                  placeholder="Walk, meeting, trip..."
                />
              </label>
              <label>
                Note
                <input
                  value={planForm.description}
                  onChange={(event) =>
                    setPlanForm({ ...planForm, description: event.target.value })
                  }
                  placeholder="Optional"
                />
              </label>
              <button className="primary-button" type="submit" disabled={!dailyRows.length}>
                Add plan
              </button>
            </form>

            <div className="calendar-grid">
              {dailyRows.map((day) => {
                const dayPlans = plans.filter((plan) => plan.date === day.time)
                return (
                  <article className="calendar-day" key={day.time}>
                    <div className="calendar-day-head">
                      <strong>{formatDate(day.time)}</strong>
                      <span>
                        {formatNumber(day.tempMin)} / {formatNumber(day.tempMax)} deg C
                      </span>
                    </div>
                    <small>{describeWeather(day.weatherCode)}</small>
                    <div className="plan-list">
                      {dayPlans.map((plan) => (
                        <div className="plan-chip" key={plan.id}>
                          <span>{plan.time}</span>
                          <strong>{plan.title}</strong>
                          {plan.description && <small>{plan.description}</small>}
                          <button type="button" onClick={() => removePlan(plan.id)}>
                            Remove
                          </button>
                        </div>
                      ))}
                      {!dayPlans.length && <span className="no-plans">No plans</span>}
                    </div>
                  </article>
                )
              })}
              {!dailyRows.length && <EmptyState text="Search a city to plan around the forecast." />}
            </div>
          </section>
        </section>
      </section>
    </main>
  )
}

function Metric({ label, value }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function EmptyState({ text }) {
  return <p className="empty-state">{text}</p>
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return text || []
  }
}

function normalizeCurrent(current) {
  if (!current) return null

  return {
    time: current.time,
    temperature: current.temperature_2m ?? current.temperature,
    humidity: current.relative_humidity_2m ?? current.humidity,
    feelsLike: current.apparent_temperature ?? current.feelsLike,
    isDay: current.is_day ?? current.isDay,
    rain: current.rain,
    weatherCode: current.weather_code ?? current.weatherCode,
    windSpeed: current.wind_speed_10m ?? current.windSpeedInteger ?? current.windSpeed,
  }
}

function buildDailyRows(daily) {
  if (!daily?.time) return []

  return daily.time.slice(0, 7).map((time, index) => ({
    time,
    weatherCode: daily.weather_code?.[index] ?? daily.weatherCodes?.[index],
    tempMax: daily.temperature_2m_max?.[index] ?? daily.tempMax?.[index],
    tempMin: daily.temperature_2m_min?.[index] ?? daily.tempMin?.[index],
    rainSum: daily.rain_sum?.[index] ?? daily.rainSum?.[index],
  }))
}

function buildHourlyRows(hourly) {
  if (!hourly?.time) return []

  return hourly.time.slice(0, 8).map((time, index) => ({
    time,
    temperature: hourly.temperature_2m?.[index] ?? hourly.temperatures?.[index],
    humidity: hourly.relative_humidity_2m?.[index] ?? hourly.humidities?.[index],
    windSpeed: hourly.wind_speed_10m?.[index] ?? hourly.windSpeeds?.[index],
  }))
}

function describeWeather(code) {
  if (code === undefined || code === null) return 'Weather details pending'
  return weatherDescriptions[code] || `Weather code ${code}`
}

function formatNumber(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '--'
  return Number(value).toFixed(1).replace('.0', '')
}

function fallback(value) {
  return value === undefined || value === null ? '--' : value
}

function formatCoordinates(weather) {
  if (!weather) return '--'
  return `${formatNumber(weather.latitude)}, ${formatNumber(weather.longitude)}`
}

function formatDate(value) {
  if (!value) return '--'
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function formatHour(value) {
  if (!value) return '--'
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function toNumberOrNull(value) {
  if (value === '') return null
  return Number(value)
}

export default App
