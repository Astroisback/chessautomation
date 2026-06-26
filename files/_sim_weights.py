import random
from collections import Counter


def select(ordered, bestmove, elo, trials=20000):
    counts = Counter()
    for _ in range(trials):
        e = max(500, min(1800, int(elo)))
        decay = 0.72 - (e - 500) * (0.72 - 0.35) / (1800 - 500)
        decay = max(0.35, min(0.72, decay))
        weights = [decay ** i for i in range(len(ordered))]
        if elo < 600 and len(ordered) > 1:
            weights[0] *= 0.12
        total = sum(weights)
        r = random.random() * total
        upto = 0.0
        for move, w in zip(ordered, weights):
            upto += w
            if r <= upto:
                counts[move] += 1
                break
    return counts


ordered = ["BEST(r1)", "r2", "r3", "r4", "r5"]
for elo in [1500, 1100, 800, 700, 600, 500, 400]:
    c = select(ordered, ordered[0], elo)
    dist = {m: f"{c[m]*100//20000}%" for m in ordered}
    print(f"elo {elo}: {dist}")
