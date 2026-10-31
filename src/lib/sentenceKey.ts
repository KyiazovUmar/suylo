/** A word of a sentence as the voice reads it. */
export interface Spoken {
  text: string
  say?: string
  punct?: string
}

/** The sentence as the voice reads it, e.g. «мен суу ичким келип жатат.» — also the name of its recording. */
export const spokenKey = (items: Spoken[]) => items.map((i) => `${(i.say ?? i.text).toLowerCase().trim()}${i.punct ?? ''}`).join(' ')
