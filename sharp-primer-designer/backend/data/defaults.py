"""SHARP default primer design parameters."""

SHARP_PRIMER_DEFAULTS = {
    "length_min": 17,
    "length_opt": 22,
    "length_max": 28,
    "tm_min": 54.0,
    "tm_opt": 62.0,
    "tm_max": 68.0,
    "gc_min": 30.0,
    "gc_opt": 50.0,
    "gc_max": 70.0,
    "max_poly_x": 4,
    "max_self_complementarity": 47.0,
    "max_self_end_complementarity": 47.0,
    "max_hairpin_th": 47.0,
}

SHARP_PAIR_DEFAULTS = {
    "max_tm_diff": 3.0,
    "max_pair_complementarity": 47.0,
    "max_pair_end_complementarity": 47.0,
}

SHARP_AMPLICON_DEFAULTS = {
    "size_min": 100,
    "size_opt": 200,
    "size_max": 500,
}

SHARP_SPECIFICITY_DEFAULTS = {
    "enabled": True,
    "evalue_threshold": 1000,
    "min_alignment_length": 15,
    "max_off_targets": 0,
}
