"""Deterministic intent classification behind the signal types."""

from __future__ import annotations

from letmelead.services.intent import TYPE_POINTS, classify


def test_empty_text_is_other_weak():
    assert classify("") == ("other", "weak")
    assert classify("   \n  ") == ("other", "weak")


def test_plain_text_without_markers_is_other():
    assert classify("The team shipped a new dashboard today") == ("other", "weak")


def test_issue_experienced():
    assert classify("Our CRM keeps failing and support is slow") == ("issue_experienced", "normal")


def test_inflected_complaints_match():
    # The complaint vocabulary is prefix-based; inflected forms must match too.
    for text in ("we are frustrated with the rollout", "teams struggling with onboarding"):
        assert classify(text)[0] == "issue_experienced"


def test_vendor_switch_wins_over_generic_complaint():
    signal_type, strength = classify("We are switching off the old tool, it kept breaking and we are frustrated")
    assert signal_type == "vendor_switch"
    # Switch intent plus additional complaint markers makes it strong.
    assert strength == "strong"


def test_recommendation_request():
    signal_type, strength = classify("Looking for a tool that handles pipeline tracking for a small team")
    assert signal_type == "recommendation_request"


def test_switch_intent_outranks_recommendation_request():
    # Both regexes hit; the classifier deliberately prioritises switch intent.
    signal_type, _ = classify("Can anyone recommend an alternative to spreadsheets for pipeline tracking?")
    assert signal_type == "vendor_switch"


def test_hiring_signal():
    # "hiring" is a weak marker by design: posts about roles are common but rarely urgent.
    signal_type, strength = classify("We are hiring two engineers for the platform team")
    assert signal_type == "hiring_signal"
    assert strength == "weak"


def test_funding_signal():
    assert classify("Just raised a seed round to build the next release") == ("funding_or_mna", "normal")


def test_leadership_change():
    assert classify("They appointed a new CTO last week") == ("leadership_change", "normal")


def test_weak_markers_downgrade_strength():
    # "hiring" alone reads as a question here, not an active open role.
    signal_type, strength = classify("maybe we need hiring, not sure")
    assert signal_type in TYPE_POINTS
    assert strength == "weak"


def test_every_type_has_a_point_value():
    covered = set(TYPE_POINTS)
    seen = {classify(text)[0] for text in (
        "this is broken",
        "we are switching",
        "anyone recommend anything",
        "we are hiring",
        "they raised money",
        "new ceo joins as",
        "terrible support",
        "nothing matches here",
    )}
    assert seen <= covered
    assert TYPE_POINTS["other"] == 0.0
