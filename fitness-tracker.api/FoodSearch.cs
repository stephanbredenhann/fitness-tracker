using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace FitnessTracker.Api;

public sealed class FoodSearch(HttpClient http, IMemoryCache cache)
{
    public record Hit(string Name, string? Brand, string Barcode, double KcalPer100g, double? ProteinPer100g, double? CarbsPer100g, double? FatPer100g);

    // ponytail: search index has no nutrients, so 10 product fetches per query; swap to USDA FDC if this gets slow
    public async Task<List<Hit>> SearchAsync(string q, CancellationToken ct)
    {
        q = q.Trim().ToLowerInvariant();
        if (q.Length < 2) return [];
        return (await cache.GetOrCreateAsync("food:" + q, async e =>
        {
            e.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24);
            using var search = await http.GetFromJsonAsync<JsonDocument>(
                $"https://search.openfoodfacts.org/search?q={Uri.EscapeDataString(q)}&langs=en&page_size=10&fields=code,product_name", ct);
            var codes = search!.RootElement.GetProperty("hits").EnumerateArray()
                .Select(h => h.TryGetProperty("code", out var c) ? c.GetString() : null)
                .Where(c => !string.IsNullOrEmpty(c)).Distinct().ToList();
            var products = await Task.WhenAll(codes.Select(c => Fetch(c!, ct)));
            return products.Where(p => p is not null).ToList()!;
        }))!;
    }

    async Task<Hit?> Fetch(string code, CancellationToken ct)
    {
        using var doc = await http.GetFromJsonAsync<JsonDocument>(
            $"https://world.openfoodfacts.org/api/v2/product/{code}?fields=product_name,brands,nutriments,nutriments_estimated", ct);
        if (!doc!.RootElement.TryGetProperty("product", out var p)) return null;
        var name = Str(p, "product_name");
        if (string.IsNullOrWhiteSpace(name)) return null;
        p.TryGetProperty("nutriments", out var n);
        p.TryGetProperty("nutriments_estimated", out var est);
        var kcal = Num(n, "energy-kcal_100g") ?? (Num(n, "energy_100g") is double kj ? kj / 4.184 : (double?)null) ?? Num(est, "energy-kcal_100g");
        if (kcal is null) return null;
        return new Hit(name!, Str(p, "brands"), code, Math.Round(kcal.Value),
            Num(n, "proteins_100g") ?? Num(est, "proteins_100g"),
            Num(n, "carbohydrates_100g") ?? Num(est, "carbohydrates_100g"),
            Num(n, "fat_100g") ?? Num(est, "fat_100g"));
    }

    static string? Str(JsonElement e, string key) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    static double? Num(JsonElement e, string key) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;
}
