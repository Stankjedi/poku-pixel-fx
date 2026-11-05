# Import fixture provenance

The PNGs were produced independently by Pillow 13.0.0 using `generate.py`, not by the POKU writer or decoder. The manifest stores Pillow's decoded straight RGBA reference bytes. No new npm dependency is needed to run the tests; Python/Pillow is only needed to regenerate these checked-in fixture files.

`array.json` is a manually authored example of Aseprite's official JSON-array schema, with a POKU pivot extension. It is not an actual Aseprite application export. Tests derive JSON-hash input from it without sorting its keys. The PNG sheet contains two different trimmed frame rectangles, partial alpha, and colored fully transparent samples. Indexed fixtures cover 1/2/4/8-bit packing and partial palette transparency. RGB and grayscale fixtures also cover color-key transparency.

The tests additionally create small PNG byte streams from PNG filter equations and Node's zlib for malformed-input cases and all five row filters. Those synthetic cases do not use the production PNG writer.
