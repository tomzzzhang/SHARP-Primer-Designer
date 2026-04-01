import React from 'react'

const SECTIONS = [
  {
    title: 'Primer Constraints',
    params: [
      {
        name: 'Length (nt)',
        fields: 'length_min / length_opt / length_max',
        default: '17 / 22 / 28',
        description: 'How many nucleotides long each primer should be. Shorter primers bind faster but less specifically. Longer primers are more specific but have higher risk of forming secondary structures like hairpins. The optimal value is what primer3 targets; min and max set hard cutoffs.',
      },
      {
        name: 'Tm (°C)',
        fields: 'tm_min / tm_opt / tm_max',
        default: '54 / 62 / 68',
        description: "Melting temperature — the temperature at which half the primer molecules are bound to the complementary template strand. Higher Tm means stronger, more stable binding. The Tm used during primer3 design is computed using the SantaLucia nearest-neighbor method under the primary condition profile\u2019s ionic concentrations. After design, Tm is recomputed under all selected profiles and methods for comparison.",
      },
      {
        name: 'GC (%)',
        fields: 'gc_min / gc_opt / gc_max',
        default: '30 / 50 / 70',
        description: 'Percentage of guanine (G) and cytosine (C) bases in the primer. GC base pairs form three hydrogen bonds compared to two for AT pairs, making them thermodynamically stronger. Extremely high or low GC content can cause problems: high GC primers may form strong secondary structures, while low GC primers may not bind stably.',
      },
      {
        name: 'Max Poly-X',
        fields: 'max_poly_x',
        default: '4',
        description: 'Maximum number of identical consecutive bases allowed (e.g., AAAA = 4). Long homopolymeric runs can cause polymerase slippage during amplification and are difficult to synthesize accurately. This is especially relevant for poly-G and poly-C runs.',
      },
      {
        name: 'Max Self-Complementarity (Th °C)',
        fields: 'max_self_complementarity',
        default: '47.0',
        description: 'Thermodynamic threshold for self-complementarity — how strongly a primer can base-pair with another copy of itself (self-dimer). Expressed as Th, the temperature at which the self-dimer would be 50% formed. If this value is too high, primer molecules will bind to each other rather than to the template, reducing amplification efficiency.',
      },
      {
        name: "Max 3' Self-Complementarity (Th °C)",
        fields: 'max_self_end_complementarity',
        default: '47.0',
        description: "Thermodynamic threshold for complementarity specifically at the 3' end of the primer with itself. 3'-end dimers are more problematic than internal dimers because DNA polymerase can extend from the 3' end, generating primer-dimer artifacts that compete with the intended amplification product.",
      },
      {
        name: 'Max Hairpin Tm (°C)',
        fields: 'max_hairpin_th',
        default: '47.0',
        description: "Maximum melting temperature of intramolecular hairpin structures. A hairpin forms when a primer folds back on itself due to internal complementary regions. If the hairpin\u2019s Tm is near or above the reaction temperature, the primer will be partially folded and unavailable for template binding.",
      },
    ],
  },
  {
    title: 'Pair Constraints',
    params: [
      {
        name: 'Max ΔTm (°C)',
        fields: 'max_tm_diff',
        default: '3.0',
        description: 'Maximum allowed difference in melting temperature between the forward and reverse primers in a pair. If the Tm values are too far apart, one primer will anneal efficiently while the other does not, leading to asymmetric amplification. A ΔTm of 1–2°C is ideal.',
      },
      {
        name: 'Max Pair Complementarity (Th °C)',
        fields: 'max_pair_complementarity',
        default: '47.0',
        description: 'Thermodynamic threshold for how strongly the forward and reverse primers can base-pair with each other (heterodimer formation). High complementarity between the two primers means they will bind each other instead of the template, consuming primers and reducing yield.',
      },
      {
        name: "Max Pair 3' Complementarity (Th °C)",
        fields: 'max_pair_end_complementarity',
        default: '47.0',
        description: "Thermodynamic threshold for complementarity between the 3' ends of the forward and reverse primers. Like 3' self-dimers, 3' heterodimers can be extended by polymerase, producing primer-dimer products that often appear as a low-molecular-weight band on a gel.",
      },
    ],
  },
  {
    title: 'Amplicon Constraints',
    params: [
      {
        name: 'Size (bp)',
        fields: 'size_min / size_opt / size_max',
        default: '100 / 200 / 500',
        description: "The total length of the amplified DNA fragment, measured from the 5\u2019 end of the forward primer to the 5\u2019 end of the reverse primer (inclusive). Shorter amplicons amplify more efficiently and are better for quantitative assays. Longer amplicons capture more of the target region, which may be needed for certain downstream applications.",
      },
    ],
  },
  {
    title: 'Condition Profiles',
    params: [
      {
        name: 'Na+ / K+ / Tris / Mg++ / dNTPs (mM)',
        fields: 'na_mm, k_mm, tris_mm, mg_mm, dntps_mm',
        default: 'Varies by profile',
        description: 'Ionic concentrations in the reaction buffer. These directly affect Tm calculations: monovalent cations (Na+, K+) stabilize DNA duplexes, while Mg++ has a strong stabilizing effect. Free Mg++ is reduced by dNTP chelation (each dNTP binds one Mg++). Different Tm calculation methods handle these ions differently — the Owczarzy 2008 method is specifically optimized for divalent cation corrections.',
      },
      {
        name: 'Primer Concentration (nM)',
        fields: 'primer_nm',
        default: '200',
        description: 'Concentration of each primer oligo in nanomolar. Higher primer concentration lowers the effective Tm because there are more free primer molecules available to bind. This parameter is used in the nearest-neighbor Tm calculations (SantaLucia and Owczarzy methods). The Wallace rule is independent of concentration.',
      },
    ],
  },
  {
    title: 'Specificity (BLAST) Settings',
    params: [
      {
        name: 'Genome Selection',
        fields: 'genome_ids',
        default: 'Lambda phage',
        description: "Which reference genomes to screen primers against using local BLAST+. Select genomes that represent the sample background — if your target is within a bacterial genome, select that genome to check that primers don\u2019t bind elsewhere in it. The Lambda phage genome is included as a test/control reference.",
      },
      {
        name: 'E-value Threshold',
        fields: 'evalue_threshold',
        default: '1000',
        description: "BLAST expect value cutoff. A high threshold (like 1000) is used intentionally for short primer queries to ensure all potentially significant alignments are captured. BLAST\u2019s statistical model can underestimate significance for very short sequences, so a permissive e-value combined with alignment length filtering gives better sensitivity.",
      },
      {
        name: 'Min Alignment Length',
        fields: 'min_alignment_length',
        default: '15',
        description: 'Minimum number of aligned bases required for a BLAST hit to be considered a potential off-target binding site. Short random matches are common in genomes; requiring at least 15 aligned bases filters out noise while catching real off-target sites.',
      },
      {
        name: 'Max Off-Target Amplicons',
        fields: 'max_off_targets',
        default: '0',
        description: 'Maximum number of off-target amplicons allowed before a primer pair is flagged as non-specific. An off-target amplicon is detected when the forward and reverse primers both have BLAST hits on the same reference sequence in the correct orientation and within a plausible amplicon size range. Set to 0 for maximum specificity.',
      },
      {
        name: 'Off-Target Tm Threshold',
        fields: 'off_target_tm_threshold',
        default: '45.0',
        description: 'Minimum binding Tm (condition-adjusted, SantaLucia/primer3) for a BLAST hit to be considered a viable off-target. Hits below this Tm are shown faded in the BLAST table and excluded from the pass/fail decision. Raise this to reduce false off-target calls (e.g., 55-60 for SHARP at 65C). The Hit Tm shown in the BLAST table uses calc_tm on the aligned portion of the primer under the primary condition profile.',
      },
      {
        name: 'Hit Tm Calculation',
        fields: '---',
        default: '---',
        description: 'Each BLAST hit\'s Tm is computed using primer3 calc_tm on the aligned query sequence (qseq) under the primary condition profile\'s salt/Mg/dNTP concentrations. For perfect matches, this equals the SantaLucia/primer3 Tm in the Tm grid. For partial matches with mismatches, this overestimates the true binding Tm (conservative). On-target hits (100% identity, full primer length) are highlighted green. Viable off-targets (Tm >= threshold) show red Tm text.',
      },
    ],
  },
  {
    title: 'Tm Calculation Methods',
    params: [
      {
        name: 'SantaLucia (primer3)',
        fields: '—',
        default: '—',
        description: 'Nearest-neighbor thermodynamic method using the SantaLucia 1998 parameters, as implemented in the primer3 C library. This is the method used during primer design (primer3 uses it internally). It accounts for nearest-neighbor stacking interactions, salt corrections for monovalent and divalent cations, and primer concentration.',
      },
      {
        name: 'SantaLucia (Biopython)',
        fields: '—',
        default: '—',
        description: 'Same SantaLucia nearest-neighbor model but implemented in Biopython with saltcorr=5 (Owczarzy 2004 monovalent + SantaLucia 1998 parameters). May give slightly different values than the primer3 implementation due to differences in salt correction formulas and edge-case handling.',
      },
      {
        name: 'Owczarzy 2008',
        fields: '—',
        default: '—',
        description: 'Nearest-neighbor method with the Owczarzy et al. 2008 salt correction (saltcorr=7 in Biopython). This method is specifically optimized for buffers containing divalent cations (Mg++), making it particularly relevant for SHARP reactions that use Mg++-containing buffers. It considers the ratio of free Mg++ to monovalent cations to select the appropriate correction formula.',
      },
      {
        name: 'Wallace Rule',
        fields: '—',
        default: '—',
        description: 'A simple, condition-independent estimate: Tm = 2°C × (A+T) + 4°C × (G+C). Does not account for nearest-neighbor interactions, salt concentrations, or primer concentration. Included as a quick sanity check and because it is still widely referenced in literature. Only accurate for short oligonucleotides (14–20 nt) in standard salt conditions.',
      },
    ],
  },
  {
    title: 'Primer Checker',
    params: [
      {
        name: 'Overview',
        fields: '\u2014',
        default: '\u2014',
        description: 'The Checker tab analyzes existing primer sequences without running a design. Enter one or more sequences (one per line) to compute Tm grids, structural thermodynamics (hairpin, homodimer, end stability), and BLAST specificity screening. If exactly two primers are entered, pair thermodynamics (heterodimer) are also computed.',
      },
      {
        name: 'Saved Primer Sets',
        fields: '\u2014',
        default: '\u2014',
        description: 'Save named sets of primer sequences for quick recall. Stored locally in your browser. Enter primers, type a name, click Save. Click a saved set to reload it.',
      },
      {
        name: 'Design Similar Primers',
        fields: '\u2014',
        default: '\u2014',
        description: 'After checking primers, click "Design Similar Primers" to switch to the Builder with constraints derived from the checked primers: length range (actual lengths +/- 2nt), GC range (actual GC% +/- 5%).',
      },
    ],
  },
  {
    title: 'Builder Features',
    params: [
      {
        name: 'Position Diversity',
        fields: 'diversity_mode',
        default: 'off',
        description: 'Controls how primer candidates are spread across the template. Off: pure penalty ranking. Sparse: 10bp min spacing. Spread: 25bp min spacing. Coverage (region bins): divides the template into equal sections and picks the best candidate from each, ensuring primers cover the full template.',
      },
      {
        name: 'Constraint Enable/Disable',
        fields: '\u2014',
        default: 'All enabled',
        description: 'Each parameter has a checkbox. Unchecked = primer3 ignores that dimension entirely (permissive bounds + zero penalty weight). Useful for SHARP: disable Tm (isothermal, Tm not predictive) and delta-Tm while keeping structural filters active.',
      },
      {
        name: 'Saved Configs',
        fields: '\u2014',
        default: '\u2014',
        description: 'Save named parameter presets (all constraints, enabled flags, diversity mode, condition profiles, BLAST settings). Click a saved config to load it.',
      },
      {
        name: 'Settings Persistence',
        fields: '\u2014',
        default: '\u2014',
        description: 'All settings (constraints, profiles, BLAST, diversity mode) are saved to your browser automatically and restored on next visit.',
      },
      {
        name: 'Export Package',
        fields: '\u2014',
        default: '\u2014',
        description: 'Select primer pairs with checkboxes, enter a target name, click Export. Downloads a zip containing a named folder with IDT bulk order sheet (.xlsx), Notion-ready record (.json), and human-readable summary (.md).',
      },
      {
        name: 'Off-Target Tm Threshold',
        fields: 'off_target_tm_threshold',
        default: '45.0',
        description: 'Minimum binding Tm (condition-adjusted) for a BLAST hit to count as a viable off-target. Hits below this are shown faded and excluded from the pass/fail decision. The Hit Tm uses calc_tm on the aligned portion under the primary condition profile. On-target hits (100% identity, full primer length) are highlighted green.',
      },
    ],
  },
]

export default function ParameterReference({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-semibold text-lg">Parameter Reference</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">
            ×
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="font-semibold text-sm uppercase tracking-wide text-primary border-b pb-1 mb-3">
                {section.title}
              </h3>
              <div className="space-y-4">
                {section.params.map((param) => (
                  <div key={param.name}>
                    <div className="flex items-baseline gap-3 mb-0.5">
                      <h4 className="font-medium text-sm">{param.name}</h4>
                      {param.default !== '—' && (
                        <span className="text-xs text-muted-foreground">
                          default: <code className="bg-muted px-1 rounded">{param.default}</code>
                        </span>
                      )}
                    </div>
                    {param.fields !== '—' && (
                      <p className="text-[11px] text-muted-foreground mb-1">
                        Field{param.fields.includes('/') || param.fields.includes(',') ? 's' : ''}: <code>{param.fields}</code>
                      </p>
                    )}
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      {param.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
