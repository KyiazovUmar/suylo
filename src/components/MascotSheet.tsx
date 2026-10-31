import { Mascot, type Face } from './Mascot'

// Open the app with ?mascot to see every expression side by side (handy for slides, too).
const FACES: Face[] = ['idle', 'happy', 'sad', 'angry', 'scared', 'tired']

export function MascotSheet() {
  return (
    <div className="mascot-sheet">
      <div className="mascot-sheet-hero">
        <Mascot size={340} still face="idle" />
      </div>
      <div className="mascot-sheet-row">
        {FACES.map((face) => (
          <figure key={face}>
            <Mascot size={150} still face={face} />
            <figcaption>{face}</figcaption>
          </figure>
        ))}
        <figure>
          <div className="mascot-sheet-sky">
            <Mascot size={150} still outlined face="happy" />
          </div>
          <figcaption>sky</figcaption>
        </figure>
      </div>
    </div>
  )
}
