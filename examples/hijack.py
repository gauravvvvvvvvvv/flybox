"""Tiny developer example: use the public API to play Connectome Hijack."""
from sdk.python.flybox import Flybox

box = Flybox()
box.challenge("hijack")
box.resume()

for population in ("LC4", "LPLC2", "LC10a", "DNa02", "DNp01"):
    print(population, box.stimulate("prime", population, 0.8))

print(box.state()["challenge"])
