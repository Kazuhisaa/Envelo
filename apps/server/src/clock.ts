let simulatedNow: Date | null = null

export const clock = {
  now(): Date {
    return simulatedNow ? new Date(simulatedNow.getTime()) : new Date()
  },
  set(date: Date) {
    simulatedNow = new Date(date.getTime())
  },
  reset() {
    simulatedNow = null
  },
  isSimulated(): boolean {
    return simulatedNow !== null
  },
}
