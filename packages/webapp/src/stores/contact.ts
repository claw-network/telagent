import type { AgentIdentityView } from "@telagent/sdk"
import type { Contact, PeerProfile } from "@telagent/protocol"
import { create } from "zustand"

import { useConnectionStore } from "@/stores/connection"

interface ContactStore {
  contacts: Contact[]
  identitiesByDid: Record<string, AgentIdentityView>
  loadingByDid: Record<string, boolean>
  errorByDid: Record<string, string | undefined>
  peerProfiles: Record<string, PeerProfile>
  loadContacts: () => Promise<void>
  addContact: (did: string, displayName: string) => Promise<Contact | null>
  removeContact: (did: string) => Promise<void>
  resolve: (did: string, force?: boolean) => Promise<AgentIdentityView | null>
  fetchPeerProfile: (did: string) => Promise<PeerProfile | null>
  getEffectiveDisplayName: (did: string) => string
  getEffectiveAvatarUrl: (did: string) => string | undefined
  clear: () => void
}

function normalizeDid(raw: string): string {
  return raw.trim()
}

export const useContactStore = create<ContactStore>((set, get) => ({
  contacts: [],
  identitiesByDid: {},
  loadingByDid: {},
  errorByDid: {},
  peerProfiles: {},
  loadContacts: async () => {
    const sdk = useConnectionStore.getState().sdk
    if (!sdk) return
    try {
      const list = await sdk.listContacts()
      set({ contacts: list })
    } catch {
      // keep existing contacts on error
    }
  },
  addContact: async (did, displayName) => {
    const sdk = useConnectionStore.getState().sdk
    if (!sdk) return null
    const contact = await sdk.addContact({ did, displayName })
    set((state) => ({
      contacts: [contact, ...state.contacts.filter((c) => c.did !== did)],
    }))
    return contact
  },
  removeContact: async (did) => {
    const sdk = useConnectionStore.getState().sdk
    if (!sdk) return
    await sdk.removeContact(did)
    set((state) => ({
      contacts: state.contacts.filter((c) => c.did !== did),
    }))
  },
  fetchPeerProfile: async (did) => {
    const normalizedDid = normalizeDid(did)
    if (!normalizedDid) return null

    // Return cached if available
    const cached = get().peerProfiles[normalizedDid]
    if (cached) return cached

    const sdk = useConnectionStore.getState().sdk
    if (!sdk) return null

    try {
      const profile = await sdk.getPeerProfile(normalizedDid)
      if (profile) {
        set((state) => ({
          peerProfiles: { ...state.peerProfiles, [normalizedDid]: profile },
        }))
      }
      return profile
    } catch {
      return null
    }
  },
  getEffectiveDisplayName: (did) => {
    const normalizedDid = normalizeDid(did)
    // Prefer peer's own nickname — it's always up-to-date from profile-card messages.
    // Fall back to the contact's displayName (which may be user-set or auto-generated).
    const peer = get().peerProfiles[normalizedDid]
    if (peer?.nickname) return peer.nickname
    const contact = get().contacts.find((c) => c.did === normalizedDid)
    if (contact?.displayName) return contact.displayName
    // Fallback: last segment of DID, truncated
    const tail = normalizedDid.split(":").at(-1) ?? normalizedDid
    return tail.slice(0, 12)
  },
  getEffectiveAvatarUrl: (did) => {
    const normalizedDid = normalizeDid(did)
    const contact = get().contacts.find((c) => c.did === normalizedDid)
    if (contact?.avatarUrl) return contact.avatarUrl
    const peer = get().peerProfiles[normalizedDid]
    if (peer?.avatarUrl) return peer.avatarUrl
    return undefined
  },
  resolve: async (did, force = false) => {
    const normalizedDid = normalizeDid(did)
    if (!normalizedDid) {
      return null
    }

    const cached = get().identitiesByDid[normalizedDid]
    if (cached && !force) {
      return cached
    }

    const sdk = useConnectionStore.getState().sdk
    if (!sdk) {
      set((state) => ({
        errorByDid: {
          ...state.errorByDid,
          [normalizedDid]: "SDK not connected",
        },
      }))
      return null
    }

    set((state) => ({
      loadingByDid: {
        ...state.loadingByDid,
        [normalizedDid]: true,
      },
      errorByDid: {
        ...state.errorByDid,
        [normalizedDid]: undefined,
      },
    }))

    try {
      const identity = await sdk.getIdentity(normalizedDid)
      set((state) => ({
        identitiesByDid: {
          ...state.identitiesByDid,
          [normalizedDid]: identity,
        },
        loadingByDid: {
          ...state.loadingByDid,
          [normalizedDid]: false,
        },
      }))
      return identity
    } catch (error) {
      set((state) => ({
        loadingByDid: {
          ...state.loadingByDid,
          [normalizedDid]: false,
        },
        errorByDid: {
          ...state.errorByDid,
          [normalizedDid]: error instanceof Error ? error.message : String(error),
        },
      }))
      return null
    }
  },
  clear: () => {
    set({
      contacts: [],
      identitiesByDid: {},
      loadingByDid: {},
      errorByDid: {},
      peerProfiles: {},
    })
  },
}))
