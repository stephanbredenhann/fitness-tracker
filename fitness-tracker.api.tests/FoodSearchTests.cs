using System.Text.Json;
using FitnessTracker.Api;
using Xunit;

public class FoodSearchTests
{
    // Shape captured from search.openfoodfacts.org on 2026-09-07: brands is an array, nutriments may be missing.
    const string Sample = """
    {"hits":[
      {"code":"2000000151418","brands":["Fresh Banana"],"product_name":"Fresh Banana"},
      {"code":"01129441","brands":["fairtrade","other"],"nutriments":{"carbohydrates_100g":23,"energy-kcal_100g":89,"fat_100g":0.3,"proteins_100g":1.1},"product_name":"Banana"},
      {"code":"01129441","brands":["dupe"],"nutriments":{"energy-kcal_100g":89},"product_name":"Banana again"},
      {"code":"555","nutriments":{"energy_100g":418.4},"product_name":"Kilojoule only"},
      {"code":"666","nutriments":{"energy-kcal_100g":50},"product_name":""}
    ]}
    """;

    [Fact]
    public void Parse_keeps_only_hits_with_kcal_and_reads_first_brand()
    {
        using var doc = JsonDocument.Parse(Sample);
        var hits = FoodSearch.Parse(doc.RootElement);

        Assert.Equal(2, hits.Count);
        Assert.Equal("Banana", hits[0].Name);
        Assert.Equal("fairtrade", hits[0].Brand);
        Assert.Equal(89, hits[0].KcalPer100g);
        Assert.Equal(1.1, hits[0].ProteinPer100g);
        Assert.Equal("Kilojoule only", hits[1].Name);
        Assert.Equal(100, hits[1].KcalPer100g);
        Assert.Null(hits[1].Brand);
    }
}
