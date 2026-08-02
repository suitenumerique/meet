export class CallbackIdHandler {
  private readonly storageKey = 'popup_callback_id'

  private generateId(): string {
    // The id is the only thing guarding /rooms/creation-callback/, which is
    // unauthenticated, so it comes from the CSPRNG rather than Math.random.
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
      ''
    )
  }

  /**
   * Gets an existing callback ID or creates a new one
   */
  public getOrCreate(): string {
    const existingId = this.get()
    if (existingId) {
      return existingId
    }

    const newId = this.generateId()
    this.set(newId)
    return newId
  }

  /**
   * Gets the current callback ID if one exists
   */
  public get(): string | null {
    return sessionStorage.getItem(this.storageKey)
  }

  /**
   * Sets a callback ID
   */
  private set(id: string): void {
    sessionStorage.setItem(this.storageKey, id)
  }

  /**
   * Removes the current callback ID
   */
  public clear(): void {
    sessionStorage.removeItem(this.storageKey)
  }
}
