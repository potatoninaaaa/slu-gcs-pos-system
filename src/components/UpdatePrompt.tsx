import { useRegisterSW } from 'virtual:pwa-register/react'

export default function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Look for a new version once an hour
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000)
    },
  })

  if (!offlineReady && !needRefresh) return null

  return (
    <div className="fixed inset-x-3 top-16 z-[70] mx-auto max-w-md rounded-xl bg-slate-800 p-4 text-sm text-white shadow-xl ring-1 ring-gold">
      {needRefresh ? (
        <>
          <p className="font-semibold text-gold">A new version is ready</p>
          <p className="mt-1 text-slate-300">
            Update between sales. The page reloads, so an unfinished cart would be cleared.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void updateServiceWorker(true)}
              className="flex-1 rounded-lg bg-gold py-2 font-bold text-slate-deep"
            >
              Update now
            </button>
            <button
              onClick={() => setNeedRefresh(false)}
              className="flex-1 rounded-lg bg-slate-700 py-2 font-semibold"
            >
              Later
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="font-semibold text-gold">Ready to work offline</p>
          <p className="mt-1 text-slate-300">The app is saved on this device and opens without internet.</p>
          <button
            onClick={() => setOfflineReady(false)}
            className="mt-3 w-full rounded-lg bg-slate-700 py-2 font-semibold"
          >
            OK
          </button>
        </>
      )}
    </div>
  )
}