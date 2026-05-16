from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class EntityType(str, Enum):
    THEME = "Theme"
    TECHNOLOGY = "Technology"
    MATERIAL = "Material"
    EQUIPMENT = "Equipment"
    PRODUCT = "Product"
    COMPANY = "Company"


class RelationType(str, Enum):
    REQUIRES = "REQUIRES"
    USES_MATERIAL = "USES_MATERIAL"
    USES_EQUIPMENT = "USES_EQUIPMENT"
    PRODUCES = "PRODUCES"
    SUPPLIES = "SUPPLIES"
    EXPOSED_TO = "EXPOSED_TO"


class Market(str, Enum):
    A = "A"
    US = "US"


@dataclass
class Entity:
    type: EntityType = EntityType.COMPANY
    name: str = ""

    def to_dict(self) -> dict:
        d = {"name": self.name}
        for k, v in self.__dict__.items():
            if k not in ("type", "name") and v is not None and not k.startswith("_"):
                if isinstance(v, Enum):
                    d[k] = v.value
                elif isinstance(v, list):
                    d[k] = v
                else:
                    d[k] = v
        return d


@dataclass
class ThemeEntity(Entity):
    def __post_init__(self):
        self.type = EntityType.THEME
    aliases: list[str] = field(default_factory=list)
    description: str = ""
    category: str = ""


@dataclass
class TechnologyEntity(Entity):
    def __post_init__(self):
        self.type = EntityType.TECHNOLOGY
    description: str = ""
    maturity: str = ""


@dataclass
class MaterialEntity(Entity):
    def __post_init__(self):
        self.type = EntityType.MATERIAL
    description: str = ""
    category: str = ""


@dataclass
class EquipmentEntity(Entity):
    def __post_init__(self):
        self.type = EntityType.EQUIPMENT
    description: str = ""
    equipment_type: str = ""


@dataclass
class ProductEntity(Entity):
    def __post_init__(self):
        self.type = EntityType.PRODUCT
    description: str = ""


@dataclass
class CompanyEntity(Entity):
    def __post_init__(self):
        self.type = EntityType.COMPANY
    ticker: str = ""
    market: Market = Market.A
    sector: str = ""
    description: str = ""


@dataclass
class Relation:
    from_name: str
    to_name: str
    type: RelationType
    properties: dict = field(default_factory=dict)


@dataclass
class GraphResult:
    nodes: list[dict]
    edges: list[dict]
