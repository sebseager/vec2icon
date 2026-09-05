/** Shown when nothing is selected: the document's own background, platforms and compatibility. */
import { setDocFill as setDocFillOp } from '@/core/model/ops'
import type { Fill, IconDoc } from '@/core/model/types'
import { useEditor } from '@/state'
import { Field, Section } from '../lib/Field'
import { HelpTip } from '../lib/HelpTip'
import { Toggle } from '../lib/Toggle'
import { FillEditor } from './FillEditor'

/** The IC2-only features this document leans on, in the words the inspector uses. */
const ic2Features = (doc: IconDoc): string[] => {
  const features: string[] = []
  if (doc.groups.some((g) => g.glass.refractivity !== undefined)) features.push('refractivity')
  if (doc.groups.some((g) => g.glass.specularPlacement !== undefined)) {
    features.push('specular placement')
  }
  return features
}

export const DocInspector = () => {
  const doc = useEditor((s) => s.doc)
  const setDocFill = useEditor((s) => s.setDocFill)
  const setWatchOS = useEditor((s) => s.setWatchOS)
  const commitCoalesced = useEditor((s) => s.commitCoalesced)

  const live =
    (appearance: 'default' | 'dark') =>
    (fill: Fill): void =>
      commitCoalesced((current) => setDocFillOp(current, appearance, fill))

  const features = ic2Features(doc)
  const darkFill: Fill = doc.fill.dark ?? doc.fill.default

  return (
    <>
      <Section
        title="Default fill"
        help={
          <HelpTip topic="Document fill">
            The background behind every layer. It is part of the document rather than a layer, so
            Icon Composer can swap it per appearance and clip it to each platform's shape.
          </HelpTip>
        }
      >
        <FillEditor
          label="Default fill"
          fill={doc.fill.default}
          onChange={(fill) => setDocFill('default', fill)}
          onLiveChange={live('default')}
        />
      </Section>

      <Section title="Dark fill">
        <Field label="Same as Default">
          <Toggle
            label="Dark fill same as Default"
            checked={doc.fill.dark === undefined}
            onChange={(same) => setDocFill('dark', same ? undefined : { ...doc.fill.default })}
          />
        </Field>
        {doc.fill.dark ? (
          <FillEditor
            label="Dark fill"
            fill={darkFill}
            onChange={(fill) => setDocFill('dark', fill)}
            onLiveChange={live('dark')}
          />
        ) : null}
      </Section>

      <Section title="Platforms">
        <Field label="watchOS">
          <Toggle label="watchOS" checked={doc.watchOS} onChange={setWatchOS} />
          <HelpTip topic="watchOS">
            Adds the circular watchOS shape to the bundle's supported platforms. iOS and macOS use
            the rounded square and are always included.
          </HelpTip>
        </Field>
      </Section>

      <Section title="Compatibility">
        <p className="text-muted-foreground">
          {features.length === 0
            ? 'Xcode 26 compatible'
            : `Requires Xcode 27 (uses: ${features.join(', ')})`}
        </p>
      </Section>
    </>
  )
}
