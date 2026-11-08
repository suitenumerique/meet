import { describe, expect, it } from 'vitest'
import {
  getUrlToWarmUp,
  shouldConnect,
  toConnectionUrl,
} from './clusterConnection'

const DEFAULT_CLUSTER_URL = 'https://livekit.example.org'
const OTHER_CLUSTER_URL = 'https://livekit-b.example.org'

const NOTHING_WARMED_UP = new Set<string>()

describe('toConnectionUrl', () => {
  it('switches an https URL to wss when the config forces it', () => {
    expect(toConnectionUrl('https://livekit-b.example.org', true)).toBe(
      'wss://livekit-b.example.org'
    )
  })

  it('keeps the URL as given otherwise', () => {
    expect(toConnectionUrl('https://livekit-b.example.org', false)).toBe(
      'https://livekit-b.example.org'
    )
    expect(toConnectionUrl('wss://livekit-b.example.org', true)).toBe(
      'wss://livekit-b.example.org'
    )
    expect(toConnectionUrl('http://localhost:7880', true)).toBe(
      'http://localhost:7880'
    )
  })
})

describe('getUrlToWarmUp', () => {
  it('waits for the config', () => {
    expect(
      getUrlToWarmUp({
        configUrl: undefined,
        joinUrl: OTHER_CLUSTER_URL,
        isConnectLatched: false,
      })
    ).toBeUndefined()
  })

  it('warms up the default cluster while the join request is in flight', () => {
    expect(
      getUrlToWarmUp({
        configUrl: DEFAULT_CLUSTER_URL,
        joinUrl: undefined,
        isConnectLatched: false,
      })
    ).toBe(DEFAULT_CLUSTER_URL)
  })

  it('warms up the cluster the room is placed on once the join answered', () => {
    expect(
      getUrlToWarmUp({
        configUrl: DEFAULT_CLUSTER_URL,
        joinUrl: OTHER_CLUSTER_URL,
        isConnectLatched: false,
      })
    ).toBe(OTHER_CLUSTER_URL)
  })

  it('keeps the default cluster when the room is placed on it', () => {
    expect(
      getUrlToWarmUp({
        configUrl: DEFAULT_CLUSTER_URL,
        joinUrl: DEFAULT_CLUSTER_URL,
        isConnectLatched: false,
      })
    ).toBe(DEFAULT_CLUSTER_URL)
  })

  it('warms up nothing once connect is on', () => {
    for (const joinUrl of [undefined, DEFAULT_CLUSTER_URL, OTHER_CLUSTER_URL]) {
      expect(
        getUrlToWarmUp({
          configUrl: DEFAULT_CLUSTER_URL,
          joinUrl,
          isConnectLatched: true,
        })
      ).toBeUndefined()
    }
  })
})

describe('shouldConnect', () => {
  it('waits for the join answer, even once the default cluster is warmed up', () => {
    expect(
      shouldConnect({
        joinUrl: undefined,
        warmedUpUrls: new Set([DEFAULT_CLUSTER_URL]),
        isConnectLatched: false,
      })
    ).toBe(false)
  })

  it('waits for the warm-up of the cluster the room is placed on', () => {
    for (const warmedUpUrls of [
      NOTHING_WARMED_UP,
      new Set([DEFAULT_CLUSTER_URL]),
    ]) {
      expect(
        shouldConnect({
          joinUrl: OTHER_CLUSTER_URL,
          warmedUpUrls,
          isConnectLatched: false,
        })
      ).toBe(false)
    }
  })

  it('connects once the cluster the room is placed on is warmed up', () => {
    expect(
      shouldConnect({
        joinUrl: OTHER_CLUSTER_URL,
        warmedUpUrls: new Set([DEFAULT_CLUSTER_URL, OTHER_CLUSTER_URL]),
        isConnectLatched: false,
      })
    ).toBe(true)
  })

  it('connects on the warm-up of the default cluster when the room is placed on it', () => {
    const connection = {
      joinUrl: DEFAULT_CLUSTER_URL,
      isConnectLatched: false,
    }

    expect(
      shouldConnect({ ...connection, warmedUpUrls: NOTHING_WARMED_UP })
    ).toBe(false)
    expect(
      shouldConnect({
        ...connection,
        warmedUpUrls: new Set([DEFAULT_CLUSTER_URL]),
      })
    ).toBe(true)
  })

  it('never stops once connect is on, whatever the credentials become', () => {
    for (const joinUrl of [undefined, DEFAULT_CLUSTER_URL, OTHER_CLUSTER_URL]) {
      expect(
        shouldConnect({
          joinUrl,
          warmedUpUrls: NOTHING_WARMED_UP,
          isConnectLatched: true,
        })
      ).toBe(true)
    }
  })
})
