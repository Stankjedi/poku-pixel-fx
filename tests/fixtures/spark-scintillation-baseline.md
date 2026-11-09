# Frozen short-spark omission baseline

`spark-scintillation-baseline.json` was generated from untouched commit
`4cabe9a235b1f6faab7fa6a3b41997583d54d204` compiled runtime, frozen before integration.
It contains SHA-256 hashes of JSON-serialized births/samples/meta/events and raw
color/light/HDR typed-array bytes, with frame scalar fields retained. Core seeds
17/61/902 cover 75 samples and seven rendered times; fire plume/dash seeds 17/61
cover default, short-exposure and explicit volumes selections at five times.
Tests read only this committed fixture, never a mutable external checkout. Do not
regenerate it from the implementation under test to make a regression pass.

`spark-finish-route-baseline.json` freezes exact UTF-8 source-template and serialized
project SHA-256 hashes from the same untouched baseline, using a fixed addedAt
value. It covers both actions, seeds 17/61, omitted styles, selected short sparks,
and explicit count/light zero controls. The finish is omitted in all these records.
