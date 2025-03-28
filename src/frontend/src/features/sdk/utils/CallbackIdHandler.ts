export class CallbackIdHandler {
  private storageKey = 'popup_callback_id'

  private generateId(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
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
