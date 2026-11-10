import { ConnectKitProvider, ConnectKitButton } from 'connectkit'

/**
 * The wallet picker is the heaviest part of the bundle and nothing else depends on it,
 * so it is loaded as its own chunk (see App.tsx) and only wraps this one button.
 */
export default function WalletButton() {
  return (
    <ConnectKitProvider>
      <ConnectKitButton />
    </ConnectKitProvider>
  )
}
