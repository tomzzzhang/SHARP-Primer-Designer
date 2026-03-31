/**
 * SHARP default primer design parameters.
 * Mirror of backend/data/defaults.py — used to initialize form state.
 */

export const DEFAULT_PRIMER_CONSTRAINTS = {
  length_min: 17,
  length_opt: 22,
  length_max: 28,
  tm_min: 54.0,
  tm_opt: 62.0,
  tm_max: 68.0,
  gc_min: 30.0,
  gc_opt: 50.0,
  gc_max: 70.0,
  max_poly_x: 4,
  max_self_complementarity: 47.0,
  max_self_end_complementarity: 47.0,
  max_hairpin_th: 47.0,
}

export const DEFAULT_PAIR_CONSTRAINTS = {
  max_tm_diff: 3.0,
  max_pair_complementarity: 47.0,
  max_pair_end_complementarity: 47.0,
}

export const DEFAULT_AMPLICON_CONSTRAINTS = {
  size_min: 100,
  size_opt: 200,
  size_max: 500,
}

/**
 * Which constraint parameters are enabled by default.
 * Key = parameter field name, value = boolean.
 * Disabled parameters are not sent to primer3 (unconstrained).
 */
export const DEFAULT_ENABLED_CONSTRAINTS = {
  // Primer constraints
  length: true,
  tm: true,
  gc: true,
  max_poly_x: true,
  max_self_complementarity: true,
  max_self_end_complementarity: true,
  max_hairpin_th: true,
  // Pair constraints
  max_tm_diff: true,
  max_pair_complementarity: true,
  max_pair_end_complementarity: true,
  // Amplicon constraints
  amplicon_size: true,
}

export const DEFAULT_SPECIFICITY = {
  genome_ids: ['lambda'],
  enabled: true,
  evalue_threshold: 1000,
  min_alignment_length: 15,
  max_off_targets: 0,
  off_target_tm_threshold: 45.0,  // °C — BLAST hits below this Tm are ignored
}

export const DEFAULT_REACTION_CONDITIONS = {
  primary_profile_id: 'sharp_cutsmart',
  additional_profile_ids: ['idt_oligoanalyzer', 'idt_primerquest_sharp'],
}

export const TM_METHOD_LABELS = {
  santalucia_primer3: 'SantaLucia (primer3)',
  santalucia_biopython: 'SantaLucia (Biopython)',
  owczarzy_2008: 'Owczarzy 2008',
  wallace: 'Wallace',
}
