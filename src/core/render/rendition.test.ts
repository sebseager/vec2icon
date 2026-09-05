import { describe, expect, it } from 'vitest'
import { RENDITIONS } from '../model/types'
import { renditionPlan } from './rendition'

describe('renditionPlan', () => {
  it('describes the default rendition', () => {
    expect(renditionPlan('default')).toEqual({
      appearance: 'default',
      plate: 'none',
      usesDocFill: true,
      usesTint: false,
      monoFromLuminance: false,
    })
  })

  it('describes the dark rendition', () => {
    expect(renditionPlan('dark')).toEqual({
      appearance: 'dark',
      plate: 'none',
      usesDocFill: true,
      usesTint: false,
      monoFromLuminance: false,
    })
  })

  it('describes clearLight', () => {
    expect(renditionPlan('clearLight')).toEqual({
      appearance: 'mono',
      plate: 'clear-light',
      usesDocFill: false,
      usesTint: false,
      monoFromLuminance: true,
    })
  })

  it('describes clearDark', () => {
    expect(renditionPlan('clearDark')).toEqual({
      appearance: 'mono',
      plate: 'clear-dark',
      usesDocFill: false,
      usesTint: false,
      monoFromLuminance: true,
    })
  })

  it('describes tintedLight', () => {
    expect(renditionPlan('tintedLight')).toEqual({
      appearance: 'mono',
      plate: 'tinted-light',
      usesDocFill: false,
      usesTint: true,
      monoFromLuminance: true,
    })
  })

  it('describes tintedDark', () => {
    expect(renditionPlan('tintedDark')).toEqual({
      appearance: 'mono',
      plate: 'tinted-dark',
      usesDocFill: false,
      usesTint: true,
      monoFromLuminance: true,
    })
  })

  it('covers every rendition, and only clear/tinted draw a plate', () => {
    for (const r of RENDITIONS) {
      const plan = renditionPlan(r)
      expect(plan).toBeDefined()
      expect(plan.usesDocFill).toBe(plan.plate === 'none')
      expect(plan.monoFromLuminance).toBe(plan.appearance === 'mono')
    }
  })
})
