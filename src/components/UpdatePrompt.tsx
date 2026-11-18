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
    <div className="fixed inset-x-3 top-20 z-[70] mx-auto max-w-md rounded-2xl bg-slate-800 p-5 text-sm text-slate-50 shadow-xl ring-1 ring-gold/60">
      {needRefresh ? (
        <>
          <p className="font-bold text-gold">A new version is ready</p>
          <p className="mt-1 text-slate-300">
            Update between sales. The page reloads, so an unfinished cart would be cleared.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => void updateServiceWorker(true)}
              className="flex-1 rounded-full bg-gold py-2.5 font-bold text-white hover:brightness-110"
            >
              Update now
            </button>
            <button
              onClick={() => setNeedRefresh(false)}
              className="flex-1 rounded-full bg-slate-700 py-2.5 font-semibold hover:bg-slate-600"
            >
              Later
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="font-bold text-gold">Ready to work offline</p>
          <p className="mt-1 text-slate-300">The app is saved on this device and opens without internet.</p>
          <button
            onClick={() => setOfflineReady(false)}
            className="mt-4 w-full rounded-full bg-slate-700 py-2.5 font-semibold hover:bg-slate-600"
          >
            OK
          </button>
        </>
      )}
    </div>
  )
}